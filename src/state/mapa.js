// The lot map: a graph of everything connected to one lot. Each lot takes one lane, reading left
// to right (entry, route steps, stock, shipped). Separations and mixes link the lanes, so the
// material can be followed from its origin to its last destination.

import {materialDe, nomeVolume, pesado, title} from './data.js';
import {obtidoDe, horas, pausado, quebraDe} from './balance.js';
import {etapasTravadas} from './rotas.js';
import {abertosDoLote} from './bags.js';

const COL = 276;
const LANE = 250;

export const noEntrada = lote => `${lote}:entrada`;
export const noEtapa = (lote, i) => `${lote}:etapa:${i}`;
export const noEstoque = lote => `${lote}:estoque`;
const noEnviado = lote => `${lote}:enviado`;

// Lots this one was made from.
function fontesDe(lote, {misturas, balances}) {
  if (lote.origem?.tipo === 'separacao') {
    const pai = balances.get(lote.origem.pai);
    const ap = pai?.apontamentos.find(a => a.id === lote.origem.apontamento);
    const item = ap?.separacao?.find(s => s.lote === lote.lote);
    return [{lote: lote.origem.pai, etapa: ap?.etapaIdx ?? Math.max(0, (pai?.rota.length ?? 1) - 1), peso: item?.peso}];
  }
  if (lote.origem?.tipo === 'mistura') {
    const mix = misturas.find(m => m.id === lote.origem.mistura);
    return (mix?.itens ?? []).map(i => ({lote: i.lote, estoque: i.de === 'estoque', etapa: balances.get(i.lote)?.proxima ?? 0, peso: i.peso}));
  }
  return [];
}

// Who was made from whom, in both directions.
function parentesco(ctx) {
  const filhos = new Map();
  for (const l of ctx.lotes) {
    if (!l.origem) continue;
    for (const f of fontesDe(l, ctx)) filhos.set(f.lote, [...(filhos.get(f.lote) ?? []), l.lote]);
  }
  return filhos;
}

// The lots drawn on the map: the selected one, the path its material already took, and the
// children of the lots that were opened; children of a closed lot stay behind a summary block.
// A lot it came from is drawn only up to where the material left it (`cortes`), without siblings.
function visiveis(foco, expandidos, ctx) {
  const porId = new Map(ctx.lotes.map(l => [l.lote, l]));
  const filhos = parentesco(ctx);
  const vistos = new Set();
  const cortes = new Map();
  const sobe = id => {
    const lote = porId.get(id);
    if (!lote || vistos.has(id)) return;
    vistos.add(id);
    for (const f of fontesDe(lote, ctx)) {
      if (!porId.has(f.lote)) continue;
      const atual = cortes.get(f.lote) ?? {etapa: -1, estoque: false};
      cortes.set(f.lote, {etapa: Math.max(atual.etapa, f.etapa), estoque: atual.estoque || Boolean(f.estoque)});
      sobe(f.lote);
    }
  };
  sobe(foco);
  const desce = id => {
    if (!expandidos.has(id) || cortes.has(id)) return;
    for (const filho of filhos.get(id) ?? []) {
      vistos.add(filho);
      desce(filho);
    }
  };
  [...vistos].forEach(desce);
  return {lotes: [...vistos].map(id => porId.get(id)).filter(Boolean), filhos, porIdTodos: porId, cortes};
}

// What is happening at each route step of a lot.
export function etapasDe(rota, b, procsDoLote) {
  const emAndamento = procsDoLote.map(p => p.etapa);
  const fila = i => b.steps[i]?.pend ?? 0;
  let atual = emAndamento.length ? Math.min(...emAndamento) : rota.findIndex((_, i) => fila(i) > 0);
  if (atual < 0) atual = -1;
  let proxima = -1;
  const lista = rota.map((setor, i) => {
    const aps = b.apontamentos.filter(a => a.etapaIdx === i);
    const procs = procsDoLote.filter(p => p.etapa === i);
    const parado = procs.some(pausado);
    let estado = 'futura';
    if (parado) estado = 'parado';
    else if (procs.length) estado = 'andamento';
    else if (fila(i) > 0) estado = 'fila';
    else if (aps.length) estado = 'feita';
    else if (proxima < 0 && atual >= 0 && i > atual) {
      estado = 'proxima';
      proxima = i;
    }
    const entrou = aps.reduce((s, a) => s + a.usado, 0);
    return {
      setor,
      idx: i,
      bagsFila: b.steps[i]?.bags?.length ?? 0,
      bagsMaquina: procs.reduce((s, p) => s + (p.bags?.length ?? 0), 0),
      bagsFeitos: aps.reduce((s, a) => s + (a.bags?.length ?? 0), 0),
      listaFila: b.steps[i]?.bags ?? [],
      listaMaquina: procs.flatMap(p => p.bags ?? []),
      estado,
      fila: fila(i),
      maquina: procs.reduce((s, p) => s + p.usado, 0),
      operador: procs[0]?.operador,
      inicio: procs[0]?.inicio,
      pausas: procs[0]?.pausas ?? [],
      entrou,
      saiu: aps.reduce((s, a) => s + obtidoDe(a), 0),
      quebra: aps.reduce((s, a) => s + quebraDe(a), 0),
      horas: aps.reduce((s, a) => s + horas(a), 0),
      apontamentos: aps
    };
  });
  return {lista, atual};
}

const FLUI = {feita: true, andamento: true, parado: true, fila: true};

export function construirMapa({foco, rotaFoco, lotes, balances, misturas, abertos, editavel, podeEditar = false, expandidos}) {
  const ctx = {lotes, balances, misturas};
  const {lotes: familia, filhos, porIdTodos, cortes} = visiveis(foco, expandidos, ctx);
  const noFamilia = new Set(familia.map(l => l.lote));
  const porId = new Map(familia.map(l => [l.lote, l]));

  const rotaDe = l => (l.lote === foco ? rotaFoco : balances.get(l.lote).rota);
  // A lot with material but no route still needs a place on the map.
  const passos = l => {
    const b = balances.get(l.lote);
    const rota = rotaDe(l);
    return rota.length ? rota : b.pend + b.maquina > 0 ? [null] : [];
  };

  // Column: a lot starts right after whatever produced it.
  const colunas = new Map();
  const coluna = l => {
    if (colunas.has(l.lote)) return colunas.get(l.lote);
    colunas.set(l.lote, 0);
    let col = 0;
    for (const f of fontesDe(l, ctx)) {
      const pai = porId.get(f.lote);
      if (!pai) continue;
      const base = coluna(pai);
      const de = f.estoque ? base + 1 + passos(pai).length : base + 1 + f.etapa;
      col = Math.max(col, de + 1);
    }
    colunas.set(l.lote, col);
    return col;
  };
  familia.forEach(coluna);

  // Lane: a parent, then its children right below it.
  const raizes = familia.filter(l => !fontesDe(l, ctx).some(f => noFamilia.has(f.lote)));
  const ordem = [];
  const visita = l => {
    if (ordem.includes(l)) return;
    ordem.push(l);
    for (const id of filhos.get(l.lote) ?? []) if (porId.has(id)) visita(porId.get(id));
  };
  [...raizes].sort((a, b) => a.data.localeCompare(b.data)).forEach(visita);

  const nodes = [];
  const edges = [];
  const edge = (source, target, extra = {}) =>
    edges.push({id: `${source}>${target}`, source, target, type: 'fluxo', ...extra, data: {estado: 'futura', ...extra.data}});

  const ocultosDe = l => (cortes.has(l.lote) ? [] : (filhos.get(l.lote) ?? []).filter(id => !porId.has(id)).map(id => porIdTodos.get(id)));
  const yDe = new Map();
  let lane = 0;
  ordem.forEach(l => {
    const b = balances.get(l.lote);
    const eFoco = l.lote === foco;
    const col = colunas.get(l.lote);
    const y = lane * LANE;
    yDe.set(l.lote, y);
    // Returned bags and a closed lot's children summary sit in the lane below.
    const devolve = b.devolvido > 0 && !cortes.has(l.lote);
    lane += ocultosDe(l).length || devolve ? 2 : 1;
    const rota = passos(l);
    const {lista} = etapasDe(rota, b, abertosDoLote(abertos, l.lote, rota));
    const emEdicao = eFoco && editavel;
    // Another lot on the drawing (a child still being processed) gets the same "+" points: using
    // one opens that lot with the machine list ready.
    const outroEditavel = !eFoco && podeEditar && !cortes.has(l.lote) && b.pend + b.maquina > 0 && !b.rotasMistas && rotaDe(l).length > 0;
    const travadas = eFoco || outroEditavel ? etapasTravadas(b) : 0;
    const maisAqui = emEdicao || outroEditavel;
    const inserirLote = outroEditavel ? l.lote : null;

    nodes.push({
      id: noEntrada(l.lote),
      type: 'entrada',
      position: {x: col * COL, y},
      connectable: emEdicao,
      data: {lote: l.lote, foco: eFoco, cliente: l.cliente, material: materialDe(l), peso: pesado(l), devolvido: b.devolvido, data: l.data, nf: l.nf, origem: l.origem?.tipo, pai: l.origem?.pai, emEdicao}
    });
    // Bags sent back to the customer: one more leg leaving the entry.
    if (devolve) {
      const id = `${l.lote}:devolucao`;
      nodes.push({
        id,
        type: 'devolucao',
        position: {x: col * COL, y: y + LANE},
        connectable: false,
        data: {lote: l.lote, foco: eFoco, peso: b.devolvido, entrada: b.entrada, devolucoes: b.devolucoes, nome: nomeVolume(l.embalagem, b.devolucoes.length).toLowerCase()}
      });
      edge(noEntrada(l.lote), id, {sourceHandle: 'baixo', targetHandle: 'topo', selectable: false, data: {estado: 'devolucao', peso: b.devolvido, foco: eFoco}});
    }

    let anterior = noEntrada(l.lote);
    let anteriorEstado = 'feita';
    const corte = cortes.get(l.lote);
    lista.forEach((real, i) => {
      if (corte && !corte.estoque && i > corte.etapa) return;
      // On the way to the selected lot this step is history: what's there today belongs to this lot.
      const e = corte ? {...real, estado: 'feita', fila: 0, maquina: 0, inicio: null, pausas: []} : real;
      const id = noEtapa(l.lote, i);
      nodes.push({
        id,
        type: 'etapa',
        position: {x: (col + 1 + i) * COL, y},
        connectable: emEdicao,
        data: {...e, lote: l.lote, foco: eFoco, n: i + 1, total: rota.length, travada: emEdicao && i < travadas, emEdicao, semRota: e.setor == null}
      });
      edge(anterior, id, {
        selectable: false,
        data: {estado: e.estado === 'parado' ? 'parada' : FLUI[e.estado] ? (e.estado === 'feita' ? 'feita' : 'ativa') : 'futura', inserir: maisAqui && i >= travadas ? i : null, inserirLote, foco: eFoco}
      });
      anterior = id;
      anteriorEstado = e.estado;
    });

    const pronto = b.est > 0 || b.enviado > 0;
    const usadoEmMistura = b.misturas.length > 0;
    const temFilhos = (filhos.get(l.lote) ?? []).length > 0;
    if (corte ? corte.estoque : pronto || usadoEmMistura || emEdicao || !temFilhos) {
      const id = noEstoque(l.lote);
      nodes.push({
        id,
        type: 'estoque',
        position: {x: (col + 1 + rota.length) * COL, y},
        connectable: emEdicao,
        data: {lote: l.lote, foco: eFoco, peso: b.est, pronto: pronto || Boolean(corte), emEdicao, aqui: !corte && b.est > 0 && b.pend + b.maquina === 0}
      });
      edge(anterior, id, {
        selectable: false,
        data: {estado: pronto || corte ? 'feita' : 'futura', inserir: maisAqui ? rota.length : null, inserirLote, foco: eFoco}
      });
      if (b.enviado > 0 && !corte) {
        nodes.push({
          id: noEnviado(l.lote),
          type: 'enviado',
          position: {x: (col + 2 + rota.length) * COL, y},
          connectable: false,
          data: {lote: l.lote, foco: eFoco, peso: b.enviado, envios: b.envios}
        });
        edge(id, noEnviado(l.lote), {selectable: false, data: {estado: 'feita', foco: eFoco}});
      }
    }
  });

  // Links between lanes: a separation leaves a step, a mix usually leaves the stock.
  const existe = new Set(nodes.map(n => n.id));
  for (const l of familia) {
    for (const f of fontesDe(l, ctx)) {
      if (!porId.has(f.lote)) continue;
      const candidato = f.estoque ? noEstoque(f.lote) : noEtapa(f.lote, f.etapa);
      const source = existe.has(candidato) ? candidato : noEntrada(f.lote);
      edge(source, noEntrada(l.lote), {
        selectable: false,
        data: {
          estado: 'ramo',
          peso: f.peso,
          foco: f.lote === foco || l.lote === foco,
          tipoRamo: l.origem.tipo
        }
      });
    }
  }

  // A closed lot: one block per place its children left from, instead of a lane for each child.
  for (const l of ordem) {
    const grupos = new Map();
    for (const filho of ocultosDe(l)) {
      const f = fontesDe(filho, ctx).find(x => x.lote === l.lote);
      const candidato = f.estoque ? noEstoque(l.lote) : noEtapa(l.lote, f.etapa);
      const source = existe.has(candidato) ? candidato : noEntrada(l.lote);
      grupos.set(source, [...(grupos.get(source) ?? []), filho]);
    }
    for (const [source, lista] of grupos) {
      const dono = nodes.find(n => n.id === source);
      const id = `${l.lote}:filhos:${source}`;
      nodes.push({
        id,
        type: 'filhos',
        position: {x: dono.position.x, y: yDe.get(l.lote) + LANE},
        connectable: false,
        data: {
          lote: l.lote,
          foco: l.lote === foco,
          resumo: true,
          peso: lista.reduce((soma, x) => soma + pesado(x), 0),
          filhos: lista.map(x => ({lote: x.lote, onde: posicaoDoLote(x, balances.get(x.lote), abertos).texto}))
        }
      });
      edge(source, id, {sourceHandle: 'baixo', targetHandle: 'topo', selectable: false, data: {estado: 'ramo', foco: l.lote === foco, semRotulo: true}});
    }
  }

  marcarFluxo(noEntrada(foco), nodes, edges, balances);

  return {nodes, edges, familia: ordem.map(l => l.lote)};
}

// One sentence for the PCP: where the material of this lot is, and where it goes next.
export function ondeEsta(lote, b, abertos) {
  const {lista} = etapasDe(b.rota, b, abertosDoLote(abertos, lote.lote, b.rota));
  const agora = lista.filter(e => ['andamento', 'parado', 'fila'].includes(e.estado));
  const proxima = lista.find(e => e.estado === 'proxima');
  return {agora, proxima, estoque: b.est, enviado: b.enviado, pendenteSemRota: !b.rota.length ? b.pend : 0};
}

// The selected lot's flow is the path of its material: everything it came from, up to the point
// where it branched off, and everything it goes on to. Sibling lots are not part of it. Red marks
// where the material has reached; orange marks where the remaining material still has to go.
function marcarFluxo(inicio, nodes, edges, balances) {
  const percorre = (de, para) => {
    const vistos = new Set([inicio]);
    const fila = [inicio];
    const caminho = [];
    while (fila.length) {
      const id = fila.pop();
      for (const e of edges) {
        if (e[de] !== id) continue;
        caminho.push(e);
        if (!vistos.has(e[para])) {
          vistos.add(e[para]);
          fila.push(e[para]);
        }
      }
    }
    return {vistos, caminho};
  };
  const frente = percorre('source', 'target');
  const tras = percorre('target', 'source');
  const noFluxo = new Set([...frente.vistos, ...tras.vistos]);
  const porId = new Map(nodes.map(n => [n.id, n]));
  const aChegar = n => (n.type === 'etapa' && ['futura', 'proxima'].includes(n.data.estado)) || (n.type === 'estoque' && !n.data.pronto);
  // A lot with nothing left to process has no continuation, even if its route has steps ahead.
  const temSaldo = n => {
    const b = balances.get(n.data.lote);
    return b.pend + b.maquina > 0;
  };
  for (const n of nodes) {
    if (!noFluxo.has(n.id)) continue;
    if (!aChegar(n)) n.className = 'fluxo';
    else if (temSaldo(n)) n.className = 'fluxo-futuro';
  }
  for (const e of [...frente.caminho, ...tras.caminho]) {
    const alvo = porId.get(e.target);
    e.data.fluxo = !aChegar(alvo) ? 'passou' : temSaldo(alvo) ? 'segue' : null;
  }
}

// Where a lot stands, in a line and step by step, for lists.
export function posicaoDoLote(lote, b, abertos) {
  const {lista} = etapasDe(b.rota, b, abertosDoLote(abertos, lote.lote, b.rota));
  const agora = lista.filter(e => ['andamento', 'parado', 'fila'].includes(e.estado));
  let texto;
  if (agora.length) texto = title(agora[0].setor) + (agora.length > 1 ? ` +${agora.length - 1}` : '');
  else if (!b.rota.length && b.pend > 0) texto = 'Sem rota definida';
  else if (b.est > 0) texto = 'Em estoque';
  else if (b.enviado > 0) texto = 'Enviado';
  else texto = 'Sem saldo';
  return {
    texto,
    etapa: agora.length ? agora[0].idx + 1 : null,
    total: b.rota.length,
    estados: lista.map(e => e.estado),
    fim: b.est > 0 ? 'estoque' : b.enviado > 0 ? 'enviado' : null
  };
}

// The list beside the map: parent lots only, each holding its children. A parent is listed while
// it or any lot that came out of it is still active.
export function arvoreDeLotes({lotes, balances, fila}) {
  const ativos = new Set(fila.filter(o => !o.legado && o.lote).map(o => o.lote));
  const filhosDe = new Map();
  for (const l of lotes) {
    if (l.origem?.tipo === 'separacao') filhosDe.set(l.origem.pai, [...(filhosDe.get(l.origem.pai) ?? []), l]);
  }
  const monta = l => {
    const filhos = (filhosDe.get(l.lote) ?? []).map(monta);
    return {lote: l, filhos, ativo: ativos.has(l.lote) || filhos.some(f => f.ativo)};
  };
  const conhecidos = new Set(lotes.map(l => l.lote));
  return lotes
    .filter(l => !(l.origem?.tipo === 'separacao' && conhecidos.has(l.origem.pai)))
    .map(monta)
    .filter(n => n.ativo && balances.has(n.lote.lote));
}

// Lots that came straight out of this one (separations and mixes).
export function filhosNoMapa(id, {lotes, balances, misturas}) {
  return parentesco({lotes, balances, misturas}).get(id) ?? [];
}
