import {useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {date, kg, nomeVolume, title} from '../state/data.js';
import {HistoricoDoBag, situacaoDoBag} from '../ui/HistoricoDoBag.jsx';
import {Icon} from '../ui/Icon.jsx';

// Find a bag by its lot and number ("3133 5", "3133-5", "3133#5") or pick it from the lot's list.
function lerBusca(texto, lotes) {
  const t = texto.trim().toUpperCase();
  if (!t) return null;
  const exato = lotes.find(l => l.lote.toUpperCase() === t);
  if (exato) return {lote: exato.lote, bag: null};
  const m = t.match(/^(.+?)[\s#\-/]+(?:BAG\s*)?(\d+)$/);
  if (m) {
    const l = lotes.find(x => x.lote.toUpperCase() === m[1]);
    if (l && Number(m[2]) >= 1 && Number(m[2]) <= l.bags.length) return {lote: l.lote, bag: Number(m[2]) - 1};
  }
  const parcial = lotes.find(l => l.lote.toUpperCase().includes(t));
  return parcial ? {lote: parcial.lote, bag: null} : null;
}

export function HistoricoBags({initial}) {
  const {lotes, balances} = useStore();
  const comBags = useMemo(() => lotes.filter(l => l.bags?.length).sort((a, b) => b.data.localeCompare(a.data) || b.lote.localeCompare(a.lote)), [lotes]);
  const [busca, setBusca] = useState('');
  const [lote, setLote] = useState(initial?.lote ?? comBags[0]?.lote ?? '');
  const [bag, setBag] = useState(initial?.bag ?? null);
  const atual = comBags.find(l => l.lote === lote);
  const b = atual ? balances.get(atual.lote) : null;
  const nome = atual ? nomeVolume(atual.embalagem) : 'Bag';

  const procurar = texto => {
    setBusca(texto);
    const achou = lerBusca(texto, comBags);
    if (!achou) return;
    setLote(achou.lote);
    setBag(achou.bag);
  };

  return (
    <main className="page">
      <div>
        <h1 className="page-title">Histórico por bag</h1>
        <p className="page-sub">Por onde cada big bag passou: máquinas, horários, tempo em máquina, pesos e quem colocou.</p>
      </div>

      <div className="toolbar">
        <label className="search" style={{maxWidth: 340}}>
          <Icon name="search" size={18} />
          <input value={busca} onChange={e => procurar(e.target.value)} placeholder="Lote e bag, ex.: 3133 5" aria-label="Buscar bag" />
        </label>
        <label className="field hist-maquina">
          <span>Lote</span>
          <select
            className="input"
            value={lote}
            onChange={e => {
              setLote(e.target.value);
              setBag(null);
            }}
          >
            {!comBags.length && <option value="">Nenhum lote com bags</option>}
            {comBags.map(l => (
              <option key={l.lote} value={l.lote}>
                {l.lote} · {title(l.cliente)} · {date(l.data)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {atual && (
        <section className="hist-bags-grade">
          <div className="lote-volumes">
            {atual.bags.map((peso, i) => {
              const estado = b?.bags.find(x => x.i === i);
              return (
                <button key={i} type="button" className={`lote-volume hist-bag-cartao ${bag === i ? 'on' : ''} ${estado ? `bag-${estado.status}` : ''}`} onClick={() => setBag(i)}>
                  <span>
                    {nome} {i + 1}
                  </span>
                  <b>{kg(estado ? estado.peso : peso)}</b>
                  <small className="bag-situacao">{estado ? situacaoDoBag(estado) : 'Modelo antigo, por peso'}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {atual && bag != null ? (
        <section className="panel">
          <HistoricoDoBag lote={atual.lote} i={bag} />
        </section>
      ) : (
        atual && <div className="empty">Escolha um bag para ver o histórico.</div>
      )}
    </main>
  );
}
