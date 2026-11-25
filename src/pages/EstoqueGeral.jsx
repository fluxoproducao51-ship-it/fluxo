import {useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {kg, materialDe, materialDoBag, title, today} from '../state/data.js';
import {Icon} from '../ui/Icon.jsx';

// What the plant holds right now, in three groups: waiting for a machine, inside one, and finished.
// Every chart filters the list below when clicked.
const GRUPOS = {
  fila: {rotulo: 'Para processar', curto: 'Para processar', cor: '#b45309'},
  maquina: {rotulo: 'Em máquina', curto: 'Em máquina', cor: '#0b62c4'},
  pronto: {rotulo: 'Pronto', curto: 'Pronto', cor: '#15803d'}
};
const ORDEM = ['fila', 'maquina', 'pronto'];
const IDADES = [
  {id: '0-7', rotulo: 'até 7 dias', ate: 7},
  {id: '8-15', rotulo: '8 a 15 dias', ate: 15},
  {id: '16-30', rotulo: '16 a 30 dias', ate: 30},
  {id: '30+', rotulo: 'mais de 30 dias', ate: Infinity}
];
const dias = iso => (iso ? Math.max(0, Math.round((Date.parse(today()) - Date.parse(iso)) / 86400000)) : 0);
const faixaDe = d => IDADES.find(f => d <= f.ate).id;

// One row per lot, group, material and machine: the smallest piece every chart can add up.
function linhasDoEstoque({lotes, balances}) {
  const linhas = [];
  const add = (l, grupo, material, setor, peso, desde) => {
    if (peso > 0) linhas.push({lote: l.lote, cliente: l.cliente, material, grupo, setor, kg: Math.round(peso), dias: dias(desde)});
  };
  for (const l of lotes) {
    const b = balances.get(l.lote);
    if (!b) continue;
    const ultimo = b.apontamentos.map(a => a.data).sort().pop() ?? l.data;
    if (b.porBag) {
      for (const x of b.bags) {
        if (x.status === 'fila') add(l, 'fila', x.material, x.setor, x.peso, l.data);
        else if (x.status === 'maquina') add(l, 'maquina', x.material, x.setor, x.peso, x.entradaMaquina?.slice(0, 10));
      }
      // Finished weight already discounts what was shipped or mixed: split it by the finished bags' material.
      const prontos = b.bags.filter(x => x.status === 'estoque');
      const soma = prontos.reduce((s, x) => s + x.peso, 0);
      if (b.est > 0) {
        if (!soma) add(l, 'pronto', materialDe(l), null, b.est, ultimo);
        else {
          const porMat = new Map();
          for (const x of prontos) porMat.set(x.material, (porMat.get(x.material) ?? 0) + x.peso);
          for (const [m, p] of porMat) add(l, 'pronto', m, null, (b.est * p) / soma, ultimo);
        }
      }
      continue;
    }
    const material = l.bagsMateriais?.length ? materialDoBag(l, 0) : materialDe(l);
    b.steps.forEach(s => add(l, 'fila', material, s.setor, s.pend, l.data));
    for (const p of b.processos) add(l, 'maquina', material, p.setor, p.usado, p.inicio?.slice(0, 10));
    add(l, 'pronto', material, null, b.est, ultimo);
  }
  return linhas;
}

const somaPor = (linhas, chave) => {
  const mapa = new Map();
  for (const r of linhas) {
    const k = r[chave] ?? '—';
    const item = mapa.get(k) ?? {chave: k, fila: 0, maquina: 0, pronto: 0, total: 0};
    item[r.grupo] += r.kg;
    item.total += r.kg;
    mapa.set(k, item);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
};

function Dica({dica}) {
  if (!dica) return null;
  return (
    <div className="eg-dica" style={{left: dica.x, top: dica.y}} role="tooltip">
      <b>{dica.titulo}</b>
      {dica.linhas.map(([cor, rotulo, valor]) => (
        <span key={rotulo}>
          {cor && <i style={{background: cor}} />}
          {rotulo}
          <em>{valor}</em>
        </span>
      ))}
    </div>
  );
}

// Horizontal bars, one per item, split by group. Clicking a bar filters the page by that item.
function Barras({titulo, itens, grupos, ativo, onEscolher, nome = x => title(x), vazio, limite = 8, setDica}) {
  const lista = itens.slice(0, limite);
  const resto = itens.slice(limite);
  const max = Math.max(1, ...lista.map(i => grupos.reduce((s, g) => s + i[g], 0)));
  return (
    <section className="eg-card">
      <div className="eg-card-topo">
        <h3>{titulo}</h3>
        {resto.length > 0 && <small>+{resto.length} com menos peso</small>}
      </div>
      {lista.length ? (
        <div className="eg-barras">
          {lista.map(i => {
            const total = grupos.reduce((s, g) => s + i[g], 0);
            const on = ativo === i.chave;
            return (
              <button
                key={i.chave}
                type="button"
                className={`eg-barra ${on ? 'on' : ''} ${ativo && !on ? 'apagada' : ''}`}
                onClick={() => onEscolher(on ? null : i.chave)}
                onMouseMove={e =>
                  setDica({x: e.clientX + 14, y: e.clientY + 14, titulo: nome(i.chave), linhas: [...grupos.filter(g => i[g] > 0).map(g => [GRUPOS[g].cor, GRUPOS[g].curto, kg(i[g])]), ...(grupos.length > 1 ? [[null, 'Total', kg(total)]] : [])]})
                }
                onMouseLeave={() => setDica(null)}
              >
                <span className="eg-barra-nome">{nome(i.chave)}</span>
                <span className="eg-barra-trilho">
                  {grupos.map(g =>
                    i[g] > 0 ? <span key={g} className="eg-seg" style={{width: `${(i[g] / max) * 100}%`, background: GRUPOS[g].cor}} /> : null
                  )}
                </span>
                <span className="eg-barra-valor">{kg(total)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="eg-vazio">{vazio}</p>
      )}
    </section>
  );
}

// Finished stock by how long it has been sitting: old stock is what sales should move first.
function Idade({linhas, ativo, onEscolher, setDica}) {
  const prontos = linhas.filter(r => r.grupo === 'pronto');
  const faixas = IDADES.map(f => ({...f, kg: prontos.filter(r => faixaDe(r.dias) === f.id).reduce((s, r) => s + r.kg, 0), lotes: new Set(prontos.filter(r => faixaDe(r.dias) === f.id).map(r => r.lote)).size}));
  const max = Math.max(1, ...faixas.map(f => f.kg));
  return (
    <section className="eg-card">
      <div className="eg-card-topo">
        <h3>Há quanto tempo está pronto</h3>
      </div>
      {prontos.length ? (
        <div className="eg-colunas">
          {faixas.map(f => {
            const on = ativo === f.id;
            return (
              <button
                key={f.id}
                type="button"
                className={`eg-coluna ${on ? 'on' : ''} ${ativo && !on ? 'apagada' : ''}`}
                onClick={() => onEscolher(on ? null : f.id)}
                onMouseMove={e => setDica({x: e.clientX + 14, y: e.clientY + 14, titulo: f.rotulo, linhas: [[GRUPOS.pronto.cor, 'Pronto', kg(f.kg)], [null, 'Lotes', String(f.lotes)]]})}
                onMouseLeave={() => setDica(null)}
              >
                <span className="eg-coluna-valor">{f.kg ? kg(f.kg) : '—'}</span>
                <span className="eg-coluna-area">
                  {f.kg > 0 && <span className="eg-coluna-barra" style={{height: `${(f.kg / max) * 100}%`, background: GRUPOS.pronto.cor}} />}
                </span>
                <span className="eg-coluna-nome">{f.rotulo}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="eg-vazio">Nada pronto em estoque.</p>
      )}
    </section>
  );
}

export function EstoqueGeral() {
  const {lotes, balances, abrirLote} = useStore();
  const todas = useMemo(() => linhasDoEstoque({lotes, balances}), [lotes, balances]);
  const [filtro, setFiltro] = useState({grupo: null, material: null, cliente: null, setor: null, idade: null});
  const [dica, setDica] = useState(null);
  const muda = campo => valor => setFiltro(f => ({...f, [campo]: valor, ...(campo === 'idade' && valor ? {grupo: 'pronto'} : {})}));

  // Each chart shows the other filters applied, never its own: so a click never empties it.
  const filtrar = (exceto = null) =>
    todas.filter(
      r =>
        (exceto === 'grupo' || !filtro.grupo || r.grupo === filtro.grupo) &&
        (exceto === 'material' || !filtro.material || r.material === filtro.material) &&
        (exceto === 'cliente' || !filtro.cliente || r.cliente === filtro.cliente) &&
        (exceto === 'setor' || !filtro.setor || r.setor === filtro.setor) &&
        (exceto === 'idade' || !filtro.idade || (r.grupo === 'pronto' && faixaDe(r.dias) === filtro.idade))
    );
  const visiveis = filtrar();
  const paraTiles = filtrar('grupo');
  const totalDe = g => paraTiles.filter(r => r.grupo === g).reduce((s, r) => s + r.kg, 0);
  const lotesDe = g => new Set(paraTiles.filter(r => r.grupo === g).map(r => r.lote)).size;
  const grupos = filtro.grupo ? [filtro.grupo] : ORDEM;
  const maquinasFila = somaPor(filtrar('setor').filter(r => r.grupo !== 'pronto' && r.setor), 'setor');

  // The list: one line per lot, adding its pieces that pass the filters.
  const porLote = new Map();
  for (const r of visiveis) {
    const item = porLote.get(r.lote) ?? {lote: r.lote, cliente: r.cliente, materiais: new Set(), fila: 0, maquina: 0, pronto: 0, onde: new Set(), dias: 0};
    item.materiais.add(r.material);
    item[r.grupo] += r.kg;
    if (r.setor) item.onde.add(`${r.grupo === 'maquina' ? 'rodando em' : 'aguardando'} ${title(r.setor)}`);
    if (r.grupo === 'pronto') item.dias = Math.max(item.dias, r.dias);
    porLote.set(r.lote, item);
  }
  const lista = [...porLote.values()].sort((a, b) => b.fila + b.maquina + b.pronto - (a.fila + a.maquina + a.pronto));
  const ativos = [
    filtro.grupo && ['grupo', GRUPOS[filtro.grupo].rotulo],
    filtro.material && ['material', title(filtro.material)],
    filtro.cliente && ['cliente', title(filtro.cliente)],
    filtro.setor && ['setor', title(filtro.setor)],
    filtro.idade && ['idade', `Pronto há ${IDADES.find(f => f.id === filtro.idade).rotulo}`]
  ].filter(Boolean);

  return (
    <main className="page eg">
      <div>
        <h1 className="page-title">Estoque geral</h1>
        <p className="page-sub">Tudo o que está na fábrica agora. Clique num número ou numa barra para filtrar.</p>
      </div>

      <section className="eg-tiles">
        {ORDEM.map(g => {
          const on = filtro.grupo === g;
          return (
            <button key={g} type="button" className={`eg-tile ${on ? 'on' : ''} ${filtro.grupo && !on ? 'apagada' : ''}`} style={{'--c': GRUPOS[g].cor}} onClick={() => setFiltro(f => ({...f, grupo: on ? null : g, idade: on || g !== 'pronto' ? null : f.idade}))}>
              <span>{GRUPOS[g].rotulo}</span>
              <b>{kg(totalDe(g))}</b>
              <small>
                {lotesDe(g)} {lotesDe(g) === 1 ? 'lote' : 'lotes'}
              </small>
            </button>
          );
        })}
      </section>

      <div className="eg-filtros">
        <div className="eg-legenda" aria-label="Legenda">
          {ORDEM.map(g => (
            <span key={g}>
              <i style={{background: GRUPOS[g].cor}} />
              {GRUPOS[g].rotulo}
            </span>
          ))}
        </div>
        {ativos.length > 0 && (
          <div className="eg-chips">
            {ativos.map(([campo, rotulo]) => (
              <button key={campo} type="button" className="eg-chip" onClick={() => muda(campo)(null)}>
                {rotulo}
                <Icon name="x" size={12} stroke={2.4} />
              </button>
            ))}
            <button type="button" className="trail-link" onClick={() => setFiltro({grupo: null, material: null, cliente: null, setor: null, idade: null})}>
              Limpar
            </button>
          </div>
        )}
      </div>

      <div className="eg-grade">
        <Barras titulo="Por material" itens={somaPor(filtrar('material'), 'material')} grupos={grupos} ativo={filtro.material} onEscolher={muda('material')} vazio="Nada em estoque com estes filtros." setDica={setDica} />
        <Barras titulo="Por cliente" itens={somaPor(filtrar('cliente'), 'cliente')} grupos={grupos} ativo={filtro.cliente} onEscolher={muda('cliente')} vazio="Nada em estoque com estes filtros." setDica={setDica} />
        <Barras
          titulo="Para processar, por máquina"
          itens={maquinasFila}
          grupos={(filtro.grupo ? [filtro.grupo] : ['fila', 'maquina']).filter(g => g !== 'pronto')}
          ativo={filtro.setor}
          onEscolher={muda('setor')}
          vazio="Nenhum material aguardando ou rodando."
          setDica={setDica}
        />
        <Idade linhas={filtrar('idade')} ativo={filtro.idade} onEscolher={muda('idade')} setDica={setDica} />
      </div>

      <section className="eg-card">
        <div className="eg-card-topo">
          <h3>Lotes ({lista.length})</h3>
          <small>Clique num lote para abrir o mapa</small>
        </div>
        {lista.length ? (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Cliente</th>
                  <th>Material</th>
                  <th>Onde está</th>
                  <th className="n">Para processar</th>
                  <th className="n">Em máquina</th>
                  <th className="n">Pronto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(r => (
                  <tr key={r.lote} onClick={() => abrirLote(r.lote)}>
                    <td className="mono">{r.lote}</td>
                    <td className="ell">{title(r.cliente)}</td>
                    <td className="ell">{[...r.materiais].map(title).join(', ')}</td>
                    <td className="ell">{[...r.onde].join(' · ') || (r.pronto ? `pronto há ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}` : '—')}</td>
                    <td className="n">{r.fila ? kg(r.fila) : '—'}</td>
                    <td className="n">{r.maquina ? kg(r.maquina) : '—'}</td>
                    <td className="n">{r.pronto ? kg(r.pronto) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="eg-vazio">Nenhum lote com estes filtros.</p>
        )}
      </section>
      <Dica dica={dica} />
    </main>
  );
}

