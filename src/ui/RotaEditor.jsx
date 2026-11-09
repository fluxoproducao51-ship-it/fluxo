import {useState} from 'react';
import {motion} from 'framer-motion';
import {title} from '../state/data.js';
import {Button} from './Button.jsx';
import {Icon} from './Icon.jsx';

const EASE_OUT = [0.16, 1, 0.3, 1];

// An ordered list of machines. The first `travadas` steps already have production records
// and can't be moved or removed; everything after them can be reordered, removed or added.
export function RotaEditor({etapas, onChange, processos, travadas = 0, atual = -1}) {
  const [nova, setNova] = useState('');
  const move = (i, d) => {
    const next = [...etapas];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = () => {
    if (!nova) return;
    onChange([...etapas, nova]);
    setNova('');
  };
  return (
    <div className="rota-edit">
      {etapas.map((e, i) => {
        const locked = i < travadas;
        return (
          <motion.div
            key={`${e}-${i}`}
            layout
            className={`rota-step ${locked ? 'locked' : ''} ${i === atual ? 'now' : ''}`}
            initial={{opacity: 0, x: -8}}
            animate={{opacity: 1, x: 0}}
            transition={{duration: 0.25, ease: EASE_OUT}}
          >
            <span className="rota-n">{locked ? <Icon name="check" size={12} stroke={3} /> : i + 1}</span>
            <span style={{flex: 1}}>{title(e)}</span>
            {locked ? (
              <span className="rota-lock">feita</span>
            ) : (
              <span className="rota-actions">
                <button type="button" aria-label="Subir" disabled={i <= travadas} onClick={() => move(i, -1)}>
                  <Icon name="chevronUp" size={14} />
                </button>
                <button type="button" aria-label="Descer" disabled={i === etapas.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevronDown" size={14} />
                </button>
                <button type="button" aria-label="Remover" onClick={() => onChange(etapas.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            )}
          </motion.div>
        );
      })}
      <div className="rota-step add">
        <span className="rota-n">
          <Icon name="truck" size={12} />
        </span>
        <span style={{flex: 1, color: 'var(--subtle)'}}>Estoque (produto acabado)</span>
      </div>
      <div style={{display: 'flex', gap: 8, marginTop: 8}}>
        <select className="input" style={{height: 40}} value={nova} onChange={e => setNova(e.target.value)}>
          <option value="">Adicionar máquina…</option>
          {processos.map(p => (
            <option key={p} value={p}>
              {title(p)}
            </option>
          ))}
        </select>
        <Button variant="secondary" icon="plus" label="Adicionar" disabled={!nova} onClick={add} />
      </div>
    </div>
  );
}

// Read-only progress strip: done, current and upcoming machines of a lot.
export function RotaProgresso({b}) {
  if (!b?.rota.length) return null;
  const atual = b.processo ? b.processo.etapa : b.proxima;
  const feitas = new Set(b.apontamentos.map(a => a.etapaIdx));
  return (
    <div className="rota-strip">
      {b.rota.map((setor, i) => {
        const estado = i === atual ? 'now' : feitas.has(i) && b.steps[i].pend === 0 ? 'done' : i < atual ? 'done' : '';
        return (
          <div key={i} className={`rota-chip ${estado}`}>
            <span className="rota-n">{estado === 'done' ? <Icon name="check" size={11} stroke={3} /> : i + 1}</span>
            <span>
              {title(setor)}
              {b.steps[i].pend > 0 && <small>{b.steps[i].pend.toLocaleString('pt-BR')} kg aguardando</small>}
              {b.processo?.etapa === i && <small>{b.processo.usado.toLocaleString('pt-BR')} kg na máquina</small>}
            </span>
          </div>
        );
      })}
      <div className={`rota-chip ${b.est > 0 && !b.pend && !b.processo ? 'now' : ''}`}>
        <span className="rota-n">
          <Icon name="truck" size={11} />
        </span>
        <span>
          Estoque
          {b.est > 0 && <small>{b.est.toLocaleString('pt-BR')} kg</small>}
        </span>
      </div>
    </div>
  );
}
