// Mass balance per lot. A lot with a route keeps one "waiting" bucket per route step:
// material enters at step 0, a process at step i takes from bucket i and its output goes to
// bucket i + 1, or to stock after the last step. That makes the sequence impossible to skip:
// material only reaches a machine after passing the one before. Lots without a route
// (old spreadsheet history) keep a single bucket.

import {pesado} from './data.js';
import {estadoDosBags, processoDoLote, rotaUnida} from './bags.js';

const minutes = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function horas(ap) {
  if (ap.horas != null) return ap.horas;
  if (!ap.inicio || !ap.fim) return 0;
  const diff = minutes(ap.fim) - minutes(ap.inicio);
  return Math.max(0, (diff < 0 ? diff + 1440 : diff) / 60);
}

// In a separation, what didn't become a child lot can stay in this lot and move on (ap.continua).
export const obtidoDe = ap =>
  ap.separacao?.length ? ap.separacao.reduce((s, item) => s + item.peso, 0) + (ap.continua?.peso ?? 0) : ap.obtido ?? 0;

// Losses of one posting by kind, {"PÓ": 20, ...}. Older postings kept them in three fixed fields.
const ANTIGAS = [['po', 'PÓ'], ['lixo', 'LIXO / REJEITO'], ['contaminado', 'CONTAMINADO']];
export function perdasDe(ap) {
  if (ap.perdas && typeof ap.perdas === 'object') return Object.fromEntries(Object.entries(ap.perdas).filter(([, kg]) => kg > 0));
  return Object.fromEntries(ANTIGAS.filter(([campo]) => ap[campo] > 0).map(([campo, nome]) => [nome, Number(ap[campo])]));
}

export const quebraDe = ap => Math.max(0, ap.usado - obtidoDe(ap));

// Running time of an open process, without its pauses, in hours.
export function horasLiquidas(proc, now = Date.now()) {
  const paused = proc.pausas.reduce((s, p) => s + ((p.fim ? Date.parse(p.fim) : now) - Date.parse(p.inicio)), 0);
  return Math.max(0, (now - Date.parse(proc.inicio) - paused) / 3600000);
}

export const pausado = proc => proc.pausas.some(p => !p.fim);

export function etapaDe(ap, rota) {
  if (ap.etapa != null) return ap.etapa;
  const i = rota.indexOf(ap.setor);
  return i >= 0 ? i : 0;
}

export function computeBalances({lotes, apontamentos, misturas, envios, ordens, abertos = [], devolucoes = []}) {
  const map = new Map();
  // Lots worked bag by bag: the steps are filled from where each bag is, not from weight moving
  // between buckets.
  const estados = estadoDosBags({lotes, apontamentos, abertos, devolucoes});
  const bagsPorLote = new Map();
  for (const e of estados.values()) bagsPorLote.set(e.lote, [...(bagsPorLote.get(e.lote) ?? []), e]);
  for (const l of lotes) {
    const entrada = pesado(l);
    const bags = bagsPorLote.get(l.lote);
    const rota = bags ? rotaUnida(l.rota ?? [], bags.map(x => x.rota)) : l.rota ?? [];
    const toStock = l.inicial === 'estoque';
    const steps = (rota.length ? rota : [null]).map(setor => ({setor, pend: 0, bags: []}));
    let est = toStock ? entrada : 0;
    if (bags) {
      est = 0;
      for (const x of bags) {
        if (x.status === 'fila') {
          const i = x.setor == null ? 0 : rota.indexOf(x.setor);
          const step = steps[i < 0 ? 0 : i];
          step.pend += x.peso;
          step.bags.push(x);
        } else if (x.status === 'estoque') est += x.peso;
      }
    } else if (!toStock) steps[0].pend = entrada;
    map.set(l.lote, {
      porBag: Boolean(bags),
      bags: bags ?? [],
      // Bags of other materials taking other machines: the lot's route alone doesn't describe them.
      rotasMistas: Boolean(bags?.some(x => JSON.stringify(x.rota) !== JSON.stringify(l.rota ?? []))),
      processos: [],
      entrada,
      rota,
      steps,
      est,
      maquina: 0,
      processo: null,
      usado: 0,
      obtido: 0,
      quebra: 0,
      po: 0,
      lixo: 0,
      contaminado: 0,
      horas: 0,
      enviado: 0,
      misturado: 0,
      devolvido: 0,
      apontamentos: [],
      envios: [],
      misturas: [],
      devolucoes: []
    });
  }
  // A whole bag sent back to the customer leaves before the first step: it never gets processed.
  for (const d of devolucoes) {
    const b = map.get(d.lote);
    if (!b) continue;
    if (!b.porBag) b.steps[0].pend -= d.peso;
    b.devolvido += d.peso;
    b.devolucoes.push(d);
  }
  const sorted = [...apontamentos].sort((a, b) => (a.data + (a.inicio ?? '')).localeCompare(b.data + (b.inicio ?? '')));
  for (const ap of sorted) {
    const b = map.get(ap.lote);
    if (!b) continue;
    const obtido = obtidoDe(ap);
    if (b.porBag || ap.bags) {
      // Bag postings only add up; where the material went is already in each bag's state.
      const i = Math.max(0, b.rota.indexOf(ap.setor));
      b.usado += ap.usado;
      b.obtido += obtido;
      b.quebra += quebraDe(ap);
      b.horas += horas(ap);
      b.apontamentos.push({...ap, etapaIdx: i});
      continue;
    }
    const i = Math.min(etapaDe(ap, b.rota), b.steps.length - 1);
    b.steps[i].pend -= ap.usado;
    const segue = ap.separacao?.length ? ap.continua?.peso ?? 0 : obtido;
    if (ap.destino === 'estoque') b.est += segue;
    else if (b.rota.length) {
      if (i + 1 < b.steps.length) b.steps[i + 1].pend += segue;
      else b.est += segue;
    } else b.steps[0].pend += segue;
    b.usado += ap.usado;
    b.obtido += obtido;
    b.quebra += quebraDe(ap);
    b.po += ap.po ?? 0;
    b.lixo += ap.lixo ?? 0;
    b.contaminado += ap.contaminado ?? 0;
    b.horas += horas(ap);
    b.apontamentos.push({...ap, etapaIdx: i});
  }
  for (const proc of abertos) {
    if (proc.bags) {
      // One process may hold bags of several lots: each lot sees its own part of it.
      for (const lote of new Set(proc.bags.map(e => e.lote))) {
        const b = map.get(lote);
        if (!b) continue;
        const meu = processoDoLote(proc, lote, b.rota);
        b.maquina += meu.usado;
        b.processos.push(meu);
        b.processo ??= meu;
      }
      continue;
    }
    const b = map.get(proc.lote);
    if (!b) continue;
    b.steps[Math.min(proc.etapa, b.steps.length - 1)].pend -= proc.usado;
    b.maquina += proc.usado;
    b.processos.push(proc);
    b.processo = proc;
  }
  for (const mix of misturas) {
    for (const item of mix.itens) {
      const b = map.get(item.lote);
      if (!b) continue;
      if (item.de === 'estoque') b.est -= item.peso;
      else {
        let left = item.peso;
        for (const s of b.steps) {
          const take = Math.min(left, Math.max(0, s.pend));
          s.pend -= take;
          left -= take;
        }
      }
      b.misturado += item.peso;
      b.misturas.push(mix);
    }
  }
  for (const envio of envios) {
    const b = map.get(envio.lote);
    if (!b) continue;
    b.est -= envio.peso;
    b.enviado += envio.peso;
    b.envios.push(envio);
  }
  const legados = new Set(ordens.map(o => o.lote));
  for (const l of lotes) {
    const b = map.get(l.lote);
    for (const s of b.steps) s.pend = Math.max(0, Math.round(s.pend));
    b.pend = b.steps.reduce((s, x) => s + x.pend, 0);
    b.est = Math.max(0, Math.round(b.est));
    b.proxima = b.rota.length ? b.steps.findIndex(s => s.pend > 0) : -1;
    b.rendimento = b.usado ? b.obtido / b.usado : null;
    // Old spreadsheet lots with no route, order or movement are closed history, not pending work.
    b.aberto =
      b.rota.length > 0 || legados.has(l.lote) || Boolean(l.origem) || Boolean(l.novo) || b.apontamentos.length > 0;
  }
  return map;
}

export function statusFrom(lote, b, ordem) {
  if (b?.entrada > 0 && b.devolvido >= b.entrada) return 'DEVOLVIDO';
  if (b?.processo) return pausado(b.processo) ? 'PARADO' : 'EM PROCESSO';
  if (b?.rota.length && b.pend > 0) return 'AGUARDANDO INICIO';
  if (b?.est > 0 && !b.pend) return 'A PRONTA ENTREGA';
  if (lote.status === 'ENTREGUE' || (b?.enviado > 0 && !b.pend && !b.est)) return 'ENTREGUE';
  if (ordem) return ordem.status;
  if (b?.est > 0) return 'A PRONTA ENTREGA';
  if (b?.aberto && b.pend > 0) return 'AGUARDANDO INICIO';
  return 'HISTORICO';
}

// What the shop-floor board shows: every active lot, plus spreadsheet orders with no lot.
export function filaDe({lotes, ordens}, balances) {
  const itens = [];
  const comLote = new Set();
  for (const l of lotes) {
    const b = balances.get(l.lote);
    if (!b?.aberto || b.pend + b.maquina + b.est <= 0) continue;
    const ordem = ordens.find(o => o.lote === l.lote);
    comLote.add(l.lote);
    const status = statusFrom(l, b, ordem);
    if (status === 'ENTREGUE' || status === 'HISTORICO' || status === 'DEVOLVIDO') continue;
    const setor = b.processo
      ? b.processo.setor
      : b.proxima >= 0
        ? b.rota[b.proxima]
        : b.pend > 0
          ? ordem?.setor ?? null
          : 'ESTOQUE';
    itens.push({
      key: l.lote,
      lote: l.lote,
      cliente: l.cliente,
      material: l.materiais.join(' + '),
      tipo: l.tipo,
      status,
      setor,
      galpao: l.galpao ?? ordem?.galpao ?? null,
      quantidade: status === 'A PRONTA ENTREGA' ? b.est : b.pend + b.maquina,
      operador: b.processo?.operador
    });
  }
  for (const o of ordens) {
    if (o.lote && comLote.has(o.lote)) continue;
    if (o.lote && lotes.some(l => l.lote === o.lote)) continue;
    itens.push({key: o.id, ordem: o.id, lote: o.lote, cliente: o.cliente, material: o.material, tipo: o.tipo, status: o.status, setor: o.setor, galpao: o.galpao, quantidade: o.quantidade, legado: true});
  }
  return itens;
}

// A bag can go back while it hasn't been in any machine yet. In the old lot model, while its
// weight is still waiting for the first step of the route.
export function podeDevolverBag(lote, b, peso, i) {
  if (lote.origem || b == null) return false;
  if (b.porBag) {
    const bag = b.bags.find(x => x.i === i);
    return Boolean(bag && bag.status === 'fila' && !bag.hist.length);
  }
  return b.steps[0].pend >= peso;
}
