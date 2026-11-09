import {useMemo, useState} from 'react';
import {motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {hours, kg, pct, pesado, title, tons} from '../state/data.js';
import {horas, obtidoDe, quebraDe} from '../state/balance.js';
import {SectionHeader} from '../ui/SectionHeader.jsx';
import {Chips} from './Producao.jsx';

const EASE_OUT = [0.16, 1, 0.3, 1];
const PERIODOS = [
  {value: 7, label: '7 dias'},
  {value: 30, label: '30 dias'},
  {value: 90, label: '90 dias'},
  {value: 0, label: 'Tudo'}
];

function since(days) {
  if (!days) return '0000';
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function useBalanco(days) {
  const {lotes, apontamentos, envios, balances} = useStore();
  return useMemo(() => {
    const from = since(days);
    const aps = apontamentos.filter(a => a.data >= from);
    const usado = aps.reduce((s, a) => s + a.usado, 0);
    const produzido = aps.reduce((s, a) => s + obtidoDe(a), 0);
    const perdas = {
      po: aps.reduce((s, a) => s + (a.po ?? 0), 0),
      lixo: aps.reduce((s, a) => s + (a.lixo ?? 0), 0),
      contaminado: aps.reduce((s, a) => s + (a.contaminado ?? 0), 0)
    };
    const quebra = aps.reduce((s, a) => s + quebraDe(a), 0);
    perdas.outros = Math.max(0, quebra - perdas.po - perdas.lixo - perdas.contaminado);
    const porSetor = {};
    for (const a of aps) {
      const p = (porSetor[a.setor] ??= {setor: a.setor, usado: 0, produzido: 0, quebra: 0, horas: 0, n: 0});
      p.usado += a.usado;
      p.produzido += obtidoDe(a);
      p.quebra += quebraDe(a);
      p.horas += horas(a);
      p.n += 1;
    }
    return {
      entrada: lotes.filter(l => !l.origem && l.data >= from).reduce((s, l) => s + pesado(l), 0),
      produzido,
      quebra,
      rendimento: usado ? produzido / usado : null,
      estoque: [...balances.values()].reduce((s, b) => s + b.est, 0),
      entregue: envios.filter(e => e.data >= from).reduce((s, e) => s + e.peso, 0),
      perdas,
      setores: Object.values(porSetor).sort((a, b) => b.usado - a.usado),
      apontamentos: aps.length
    };
  }, [lotes, apontamentos, envios, balances, days]);
}

function Tile({label, value, unit, hint, tone}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <b style={tone ? {color: `var(--${tone})`} : null}>
        {value}
        {unit && <small>{unit}</small>}
      </b>
      <span className="tile-hint">{hint}</span>
    </div>
  );
}

export function BalancoMassa({onGo}) {
  const [days, setDays] = useState(30);
  const r = useBalanco(days);
  return (
    <section>
      <div className="section-head" style={{flexWrap: 'wrap', gap: 12}}>
        <h2 className="section-title">Balanço de massa</h2>
        <Chips id="periodo-pill" value={days} onChange={setDays} options={PERIODOS} />
      </div>
      <div className="tiles" key={days}>
        <Tile label="Entrada de material" value={tons(r.entrada)} unit="t" hint="pesagens de nota" />
        <Tile label="Produzido" value={tons(r.produzido)} unit="t" hint={`${r.apontamentos} apontamentos`} />
        <Tile label="Quebra" value={tons(r.quebra)} unit="t" hint="entrada nas etapas − saída" tone={r.quebra ? 'stop' : null} />
        <Tile
          label="Rendimento"
          value={r.rendimento == null ? '—' : pct(r.rendimento).replace('+', '')}
          hint="aproveitamento médio"
          tone="run"
         
        />
        <Tile label="Em estoque" value={tons(r.estoque)} unit="t" hint="produto acabado agora" tone="stock" />
        <Tile label="Entregue" value={tons(r.entregue)} unit="t" hint="enviado aos clientes" tone="ok" />
      </div>
      <div className="grid-2 balanco">
        <Perdas perdas={r.perdas} total={r.quebra} />
        <Desempenho setores={r.setores} onGo={onGo} />
      </div>
    </section>
  );
}

const CATEGORIAS = [
  {key: 'po', label: 'Pó', color: 'var(--subtle)'},
  {key: 'lixo', label: 'Lixo / rejeito', color: 'var(--stop)'},
  {key: 'contaminado', label: 'Contaminado', color: 'var(--ready)'},
  {key: 'outros', label: 'Sem categoria', color: 'var(--line-2)'}
];

function Perdas({perdas, total}) {
  return (
    <div className="panel">
      <SectionHeader title="Perdas por categoria" />
      {total ? (
        <>
          <div className="mix-bar" style={{height: 14}}>
            {CATEGORIAS.filter(c => perdas[c.key]).map(c => (
              <motion.div
                key={c.key}
                initial={{flexGrow: 0}}
                animate={{flexGrow: perdas[c.key] / total}}
                transition={{duration: 0.7, ease: EASE_OUT}}
                style={{background: c.color}}
              />
            ))}
          </div>
          <div className="loss-list">
            {CATEGORIAS.map(c => (
              <div key={c.key} className="loss">
                <i style={{background: c.color}} />
                <span>{c.label}</span>
                <b>{kg(perdas[c.key])}</b>
                <small>{pct(perdas[c.key] / total).replace('+', '')}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">Sem perdas registradas no período.</div>
      )}
    </div>
  );
}

function Desempenho({setores, onGo}) {
  const max = Math.max(...setores.map(s => s.usado), 1);
  return (
    <div className="panel">
      <SectionHeader title="Desempenho por processo" onSeeAll={() => onGo('apontar')} seeAllLabel="Apontar" />
      {setores.length ? (
        <div className="perf">
          <div className="perf-row perf-head">
            <span>Processo</span>
            <span />
            <span className="num">Produzido</span>
            <span className="num">Quebra</span>
            <span className="num hide-sm">Horas</span>
            <span className="num">kg/h</span>
          </div>
          {setores.map((s, i) => (
            <div key={s.setor} className="perf-row">
              <span className="cut">{title(s.setor)}</span>
              <span className="track">
                <motion.span
                  className="fill"
                  initial={{scaleX: 0}}
                  animate={{scaleX: s.usado / max}}
                  transition={{duration: 0.7, ease: EASE_OUT, delay: i * 0.05}}
                >
                  <span style={{width: `${(s.produzido / s.usado) * 100}%`}} />
                </motion.span>
              </span>
              <span className="num">{kg(s.produzido)}</span>
              <span className="num" style={{color: 'var(--stop)'}}>{pct(s.quebra / s.usado).replace('+', '')}</span>
              <span className="num hide-sm">{hours(s.horas)}</span>
              <span className="num">{s.horas >= 0.05 ? Math.round(s.produzido / s.horas).toLocaleString('pt-BR') : '—'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Nenhum apontamento no período.</div>
      )}
    </div>
  );
}
