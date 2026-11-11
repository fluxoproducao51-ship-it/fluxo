import {useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {date, hours, kg, materialDe, pct, title, today} from '../state/data.js';
import {horas, obtidoDe, pausado, perdasDe, quebraDe} from '../state/balance.js';
import {Status} from '../ui/Status.jsx';
import {Chips} from './Producao.jsx';

const PERIODOS = [
  {value: '7', label: '7 dias'},
  {value: '30', label: '30 dias'},
  {value: '90', label: '90 dias'},
  {value: 'tudo', label: 'Tudo'}
];

const desde = periodo => {
  if (periodo === 'tudo') return '';
  const d = new Date();
  d.setDate(d.getDate() - Number(periodo) + 1);
  return d.toLocaleDateString('sv-SE');
};

const minutosParado = ap => ap.pausas?.reduce((s, p) => s + Math.max(0, (Date.parse(p.fim) - Date.parse(p.inicio)) / 60000), 0) ?? 0;
const tempo = min => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);

// Production history of one machine: every finished posting, what went in, what came out, and the stops.
export function HistoricoMaquinas({initial}) {
  const {cadastros, apontamentos, abertos, loteDe, abrirLote} = useStore();
  const maquinas = useMemo(() => [...cadastros.processos].sort((a, b) => a.nome.localeCompare(b.nome)), [cadastros.processos]);
  const [maquina, setMaquina] = useState(initial?.maquina ?? maquinas.find(m => m.ativo)?.nome ?? '');
  const [periodo, setPeriodo] = useState('30');

  // Machines grouped by sector in the picker; the ones without a sector come last.
  const grupos = useMemo(() => {
    const porSetor = new Map();
    for (const m of maquinas) porSetor.set(m.setor ?? '', [...(porSetor.get(m.setor ?? '') ?? []), m]);
    return [...porSetor.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  }, [maquinas]);

  const atual = maquinas.find(m => m.nome === maquina);
  const inicio = desde(periodo);
  const lista = useMemo(
    () =>
      apontamentos
        .filter(ap => ap.setor === maquina && (!inicio || ap.data >= inicio))
        .sort((a, b) => b.data.localeCompare(a.data) || (b.inicio ?? '').localeCompare(a.inicio ?? '')),
    [apontamentos, maquina, inicio]
  );
  const rodando = abertos.filter(p => p.setor === maquina);

  const soma = f => lista.reduce((s, ap) => s + f(ap), 0);
  const usado = soma(ap => ap.usado ?? 0);
  const obtido = soma(obtidoDe);
  const h = soma(horas);
  const parado = soma(minutosParado);
  const paradas = lista.flatMap(ap => ap.pausas ?? []);
  const porMotivo = Object.entries(
    paradas.reduce((acc, p) => {
      const m = p.motivo || 'SEM MOTIVO';
      acc[m] = acc[m] ?? {n: 0, min: 0};
      acc[m].n += 1;
      acc[m].min += Math.max(0, (Date.parse(p.fim) - Date.parse(p.inicio)) / 60000);
      return acc;
    }, {})
  ).sort((a, b) => b[1].min - a[1].min);
  const dias = new Set(lista.map(ap => ap.data)).size;
  const porPerda = Object.entries(
    lista.reduce((acc, ap) => {
      for (const [tipo, peso] of Object.entries(perdasDe(ap))) acc[tipo] = (acc[tipo] ?? 0) + peso;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <main className="page">
      <div>
        <h1 className="page-title">Histórico por máquina</h1>
        <p className="page-sub">Tudo o que cada máquina produziu: lotes, pesos, rendimento, horas e paradas.</p>
      </div>

      <div className="toolbar">
        <label className="field hist-maquina">
          <span>Máquina</span>
          <select className="input" value={maquina} onChange={e => setMaquina(e.target.value)}>
            {!maquinas.length && <option value="">Nenhuma máquina cadastrada</option>}
            {grupos.map(([setor, ms]) => (
              <optgroup key={setor || '-'} label={setor ? title(setor) : 'Sem setor'}>
                {ms.map(m => (
                  <option key={m.nome} value={m.nome}>
                    {title(m.nome)}
                    {m.ativo ? '' : ' (inativa)'}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Chips id="hist-periodo" value={periodo} onChange={setPeriodo} options={PERIODOS} />
      </div>

      {atual && (
        <div className="hist-cabecalho">
          <b>{title(atual.nome)}</b>
          <span>{atual.setor ? `Setor ${title(atual.setor)}` : 'Sem setor'}</span>
          {atual.galpao && <span>{title(atual.galpao)}</span>}
          {atual.capacidade && <span>Capacidade {atual.capacidade.toLocaleString('pt-BR')} kg/h</span>}
          <span className="hist-agora">
            Agora:{' '}
            {rodando.some(pausado) ? (
              <Status value="PARADO" short />
            ) : rodando.length ? (
              <>
                <Status value="EM PROCESSO" short /> lote {rodando.map(p => p.lote).join(', ')}
              </>
            ) : (
              <span className="maq-livre">Livre</span>
            )}
          </span>
        </div>
      )}

      <section className="kpis" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'}}>
        <div className="kpi">
          <span>Lançamentos</span>
          <b>{lista.length}</b>
          <small>{dias} {dias === 1 ? 'dia trabalhado' : 'dias trabalhados'}</small>
        </div>
        <div className="kpi">
          <span>Processado</span>
          <b>{kg(usado)}</b>
          <small>entrou na máquina</small>
        </div>
        <div className="kpi">
          <span>Produzido</span>
          <b>{kg(obtido)}</b>
          <small>rendimento {usado ? pct(obtido / usado).replace('+', '') : '—'}</small>
        </div>
        <div className="kpi">
          <span>Horas trabalhadas</span>
          <b>{hours(h)}</b>
          <small>{h ? `${kg(Math.round(usado / h))}/h` : '—'}</small>
        </div>
        <div className="kpi">
          <span>Paradas</span>
          <b>{paradas.length}</b>
          <small>{parado ? tempo(parado) : 'nenhuma'}</small>
        </div>
      </section>

      {porMotivo.length > 0 && (
        <section>
          <h2 className="section-title">Paradas por motivo</h2>
          <div className="hist-motivos">
            {porMotivo.map(([motivo, v]) => (
              <div key={motivo} className="hist-motivo">
                <b>{title(motivo)}</b>
                <span>
                  {v.n} {v.n === 1 ? 'vez' : 'vezes'} · {tempo(v.min)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {porPerda.length > 0 && (
        <section>
          <h2 className="section-title">Perdas por tipo</h2>
          <div className="hist-motivos">
            {porPerda.map(([tipo, peso]) => (
              <div key={tipo} className="hist-motivo">
                <b>{title(tipo)}</b>
                <span>
                  {kg(peso)} · {usado ? pct(peso / usado).replace('+', '') : '—'} do processado
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Produção</h2>
        <div className="dtable-wrap">
          <table className="dtable hist-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Horário</th>
                <th>Lote</th>
                <th>Material</th>
                <th>Operador</th>
                <th className="n">Entrou</th>
                <th className="n">Saiu</th>
                <th className="n">Quebra</th>
                <th className="n">Rend.</th>
                <th className="n">Horas</th>
                <th>Paradas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(ap => {
                const lote = loteDe(ap.lote);
                const saiu = obtidoDe(ap);
                const min = minutosParado(ap);
                return (
                  <tr key={ap.id} onClick={() => abrirLote(ap.lote)} title="Abrir no mapa do lote">
                    <td>{ap.data === today() ? 'Hoje' : date(ap.data, true)}</td>
                    <td style={{color: 'var(--muted)'}}>{ap.inicio && ap.fim ? `${ap.inicio}–${ap.fim}` : '—'}</td>
                    <td style={{fontWeight: 600, fontFamily: 'var(--mono)'}}>{ap.lote}</td>
                    <td className="ell">{lote ? title(materialDe(lote)) : '—'}</td>
                    <td className="ell">{title(ap.operador) || '—'}</td>
                    <td className="n">{kg(ap.usado)}</td>
                    <td className="n">{kg(saiu)}</td>
                    <td className="n">{kg(quebraDe(ap))}</td>
                    <td className="n">{ap.usado ? pct(saiu / ap.usado).replace('+', '') : '—'}</td>
                    <td className="n">{hours(horas(ap))}</td>
                    <td style={{color: 'var(--muted)'}}>
                      {ap.pausas?.length ? `${ap.pausas.length} · ${tempo(min)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lista.length && (
            <div className="empty">{maquina ? 'Nenhum lançamento desta máquina no período.' : 'Cadastre uma máquina para ver o histórico.'}</div>
          )}
        </div>
      </section>
    </main>
  );
}
