// Deleting a lot takes along everything that only exists because of it: the lots split out of it,
// mixes that used it (and the lot each mix made), its postings, open processes, shipments and orders.
export function oQueSaiComLote(id, {lotes, misturas, apontamentos, abertos, envios, ordens, devolucoes = []}) {
  const saem = new Set([id]);
  const misturasFora = new Set();
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const m of misturas) {
      if (misturasFora.has(m.id)) continue;
      if (saem.has(m.lote) || m.itens.some(i => saem.has(i.lote))) {
        misturasFora.add(m.id);
        mudou = true;
      }
    }
    for (const l of lotes) {
      if (saem.has(l.lote)) continue;
      const doPai = l.origem?.tipo === 'separacao' && saem.has(l.origem.pai);
      const daMistura = l.origem?.tipo === 'mistura' && misturasFora.has(l.origem.mistura);
      if (doPai || daMistura) {
        saem.add(l.lote);
        mudou = true;
      }
    }
  }
  const doLote = r => saem.has(r.lote);
  return {
    lotes: saem,
    misturas: misturasFora,
    apontamentos: apontamentos.filter(doLote).length,
    abertos: abertos.filter(doLote).length,
    envios: envios.filter(doLote).length,
    ordens: ordens.filter(doLote).length,
    devolucoes: devolucoes.filter(doLote).length
  };
}

export function semLote(state, id) {
  const fora = oQueSaiComLote(id, state);
  const fica = r => !fora.lotes.has(r.lote);
  return {
    ...state,
    lotes: state.lotes.filter(fica),
    misturas: state.misturas.filter(m => !fora.misturas.has(m.id)),
    apontamentos: state.apontamentos.filter(fica),
    // A process may also hold bags of other lots: those stay, the deleted lot's bags leave it.
    abertos: state.abertos
      .map(p => {
        if (!p.bags) return p;
        const bags = p.bags.filter(e => !fora.lotes.has(e.lote));
        if (bags.length === p.bags.length) return p;
        return bags.length ? {...p, bags, lote: bags[0].lote, usado: bags.reduce((s, e) => s + e.peso, 0)} : null;
      })
      .filter(p => p && fica(p)),
    envios: state.envios.filter(fica),
    ordens: state.ordens.filter(fica),
    devolucoes: (state.devolucoes ?? []).filter(fica),
    // The database clears the link on CRM activities by itself; keep the screen in step.
    crm: {...state.crm, atividades: state.crm.atividades.map(a => (a.lote && fora.lotes.has(a.lote) ? {...a, lote: null} : a))}
  };
}
