import {useState} from 'react';
import {useStore} from '../state/store.jsx';
import {BOARD, GALPOES, STATUS, kg, materialDe, title} from '../state/data.js';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {Status} from '../ui/Status.jsx';

export function Chips({options, value, onChange}) {
  return (
    <div className="filters">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`chip ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Producao() {
  const {fila, loteDe, abrirLote} = useStore();
  const [galpao, setGalpao] = useState('TODOS');
  const shown = fila.filter(o => galpao === 'TODOS' || o.galpao === galpao);
  return (
    <main className="page" style={{gap: 28, maxWidth: 1600}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap'}}>
        <div>
          <h1 className="page-title">Produção</h1>
          <p className="page-sub">
            A situação de cada lote muda sozinha conforme os processos são iniciados, pausados e finalizados.
          </p>
        </div>
        <Chips
          id="galpao-pill"
          value={galpao}
          onChange={setGalpao}
          options={[{value: 'TODOS', label: 'Todos os galpões'}, ...GALPOES.map(g => ({value: g, label: title(g)}))]}
        />
      </div>
      <section className="board">
        {BOARD.map(status => {
          const list = shown.filter(o => o.status === status);
          const total = list.reduce((s, o) => s + (o.quantidade ?? 0), 0);
          return (
            <div key={status} className="column">
              <div className="column-head">
                <Status value={status} />
                <span className="kg">
                  {list.length} · {kg(total)}
                </span>
              </div>
              <div className="column-list">
                {list.map(o => {
                    const lote = loteDe(o.lote);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        className="job"
                        disabled={o.legado}
                        onClick={() => abrirLote(o.lote)}
                      >
                        <span className="job-thumb">
                          <MaterialCode material={lote ? materialDe(lote) : o.material} tipo={o.tipo} />
                        </span>
                        <span style={{minWidth: 0, flex: 1}}>
                          <div className="job-title">{o.lote ? `Lote ${o.lote}` : 'Sem lote'}</div>
                          <div className="job-sub">{title(o.cliente)}</div>
                          <div className="job-sub">{title(o.material)}</div>
                          <div className="job-meta">
                            <span className="badge">{kg(o.quantidade)}</span>
                            <span>
                              {[o.status === 'A PRONTA ENTREGA' ? 'Estoque' : title(o.setor), title(o.galpao)].filter(Boolean).join(' · ')}
                            </span>
                            {o.operador && <span>· {title(o.operador)}</span>}
                            {o.legado && <span className="tag">quadro antigo</span>}
                          </div>
                        </span>
                      </button>
                    );
                  })}
                                {!list.length && <div className="empty">Nenhum lote {STATUS[status].short.toLowerCase()}</div>}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
