// Production by big bag. A bag is a position in its lot (lot 3133, bag 5); nothing about it is stored
// as a running state. Where it is, what it weighs now and where it has been all come from the
// postings that carried it (apontamentos.bags) and the running processes holding it (abertos.bags).
// Lots with postings from before bags existed keep the old lot-level model until they finish.

import {materialDoBag} from './data.js';

export const bagId = (lote, i) => `${lote}#${i + 1}`;
export const numeroDoBag = id => Number(id.split('#').pop());

// Route of one bag: its own when it is of another material, otherwise the lot's.
export const rotaDoBag = (lote, i) => lote.bagsRotas?.[i] ?? lote.rota ?? [];

export function bagsDoLote(lote) {
  return (lote.bags ?? []).map((peso, i) => ({
    id: bagId(lote.lote, i),
    lote: lote.lote,
    i,
    n: i + 1,
    material: materialDoBag(lote, i),
    pesoInicial: peso,
    rota: rotaDoBag(lote, i)
  }));
}

// Lots that already have lot-level postings or processes stay in the old model.
export function lotesLegados({apontamentos, abertos}) {
  return new Set([...apontamentos.filter(a => !a.bags).map(a => a.lote), ...abertos.filter(p => !p.bags).map(p => p.lote)]);
}

export const ehPorBag = (lote, legados) => (lote.bags?.length ?? 0) > 0 && !legados.has(lote.lote);

// Time a bag spent inside the machine, without the stops that happened while it was there.
export function tempoNaMaquina(entrada, saida, pausas = [], agora = Date.now()) {
  const ini = Date.parse(entrada);
  const fim = saida ? Date.parse(saida) : agora;
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini) return 0;
  const parado = pausas.reduce((s, p) => {
    const a = Math.max(ini, Date.parse(p.inicio));
    const b = Math.min(fim, p.fim ? Date.parse(p.fim) : agora);
    return s + Math.max(0, b - a);
  }, 0);
  return Math.max(0, fim - ini - parado) / 3600000;
}

// Where every bag of every bag-model lot is right now, with its history.
// status: fila (waiting for `setor`), maquina (inside `setor`), estoque, separado, devolvido.
export function estadoDosBags({lotes, apontamentos, abertos, devolucoes = []}) {
  const legados = lotesLegados({apontamentos, abertos});
  const passagens = new Map();
  for (const ap of apontamentos) {
    if (!ap.bags) continue;
    for (const e of ap.bags) {
      const lista = passagens.get(e.bag) ?? [];
      lista.push({...e, setor: ap.setor, processo: ap.processo, apontamento: ap.id, lote: ap.lote, pausas: ap.pausas ?? [], operadorProcesso: ap.operador});
      passagens.set(e.bag, lista);
    }
  }
  const naMaquina = new Map();
  for (const proc of abertos) for (const e of proc.bags ?? []) naMaquina.set(e.bag, {...e, proc});
  const devolvidos = new Map(devolucoes.map(d => [bagId(d.lote, d.bag), d]));

  const estado = new Map();
  for (const l of lotes) {
    if (!ehPorBag(l, legados)) continue;
    for (const bag of bagsDoLote(l)) {
      const hist = (passagens.get(bag.id) ?? []).sort((a, b) => (a.saida ?? '').localeCompare(b.saida ?? ''));
      const ultimo = hist[hist.length - 1];
      const dentro = naMaquina.get(bag.id);
      const devolucao = devolvidos.get(bag.id);
      const etapa = ultimo ? ultimo.etapa + 1 : 0;
      const peso = ultimo ? ultimo.pesoSaida ?? 0 : bag.pesoInicial;
      // A received lot with no route yet is waiting for the PCP, not finished.
      const semRota = !bag.rota.length && l.inicial !== 'estoque' && !hist.length;
      let status;
      if (devolucao && !hist.length && !dentro) status = 'devolvido';
      else if (ultimo?.destino === 'separado') status = 'separado';
      else if (dentro) status = 'maquina';
      else if (semRota || etapa < bag.rota.length) status = 'fila';
      else status = 'estoque';
      estado.set(bag.id, {
        ...bag,
        status,
        etapa: dentro ? dentro.etapa : etapa,
        setor: dentro ? dentro.proc.setor : status === 'fila' ? bag.rota[etapa] ?? null : null,
        peso: dentro ? dentro.peso : peso,
        hist,
        proc: dentro?.proc ?? null,
        entradaMaquina: dentro?.entrada ?? null,
        operadorEntrada: dentro?.operador ?? null,
        devolucao: devolucao ?? null
      });
    }
  }
  return estado;
}

// The steps of a lot whose bags may follow different routes: the lot's own route, with the
// machines only some bags go through slotted in after the machine that comes before them.
export function rotaUnida(rotaLote, rotas) {
  const unida = [...rotaLote];
  for (const rota of rotas) {
    rota.forEach((setor, i) => {
      if (unida.includes(setor)) return;
      const antes = i > 0 ? unida.indexOf(rota[i - 1]) : -1;
      unida.splice(antes + 1, 0, setor);
    });
  }
  return unida;
}

// A running process as one lot sees it: only its own bags, at its own step.
export function processoDoLote(proc, lote, rota) {
  if (!proc.bags) return proc.lote === lote ? proc : null;
  const meus = proc.bags.filter(e => e.lote === lote);
  if (!meus.length) return null;
  const etapa = rota.indexOf(proc.setor);
  return {...proc, lote, etapa: etapa < 0 ? proc.etapa : etapa, usado: meus.reduce((s, e) => s + e.peso, 0), bags: meus};
}

export const abertosDoLote = (abertos, lote, rota) => abertos.map(p => processoDoLote(p, lote, rota)).filter(Boolean);

// Machine hours counted once per process, even when it left several postings (one per lot, or one
// per bag finished early). The latest of them covers the whole running time and every stop.
export function porProcesso(aps) {
  const melhor = new Map();
  const soltos = [];
  for (const a of aps) {
    if (!a.processo) soltos.push(a);
    else if (!melhor.has(a.processo) || (a.horas ?? 0) > (melhor.get(a.processo).horas ?? 0)) melhor.set(a.processo, a);
  }
  return [...soltos, ...melhor.values()];
}

export const rotuloDoBag = (bag, nome = 'Bag') => `${nome} ${bag.n} · lote ${bag.lote}`;
