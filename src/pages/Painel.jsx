import {useMemo} from 'react';
import {useStore} from '../state/store.jsx';
import {BOARD, date, divergencia, kg, materialDe, pct, pesado, title, tons} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';
import {Status} from '../ui/Status.jsx';
import {BalancoMassa} from './Balanco.jsx';

// Stopped lots first: they are what the PCP has to act on.
const PRIORIDADE = ['PARADO', ...BOARD.filter(s => s !== 'PARADO')];

function Indicadores({onGo}) {
  const {fila} = useStore();
  const soma = status => fila.filter(o => o.status === status).reduce((s, o) => s + (o.quantidade ?? 0), 0);
  const conta = status => fila.filter(o => o.status === status).length;
  const cells = [
    {label: 'Lotes ativos', value: fila.length, hint: `${tons(fila.reduce((s, o) => s + (o.quantidade ?? 0), 0))} t na fábrica`},
    {label: 'Em processo', value: conta('EM PROCESSO'), hint: kg(soma('EM PROCESSO')), color: 'var(--run)'},
    {label: 'Parados', value: conta('PARADO'), hint: kg(soma('PARADO')), color: conta('PARADO') ? 'var(--stop)' : undefined},
    {label: 'Aguardando início', value: conta('AGUARDANDO INICIO'), hint: kg(soma('AGUARDANDO INICIO')), color: 'var(--wait)'},
    {label: 'Pronto para entrega', value: conta('A PRONTA ENTREGA'), hint: kg(soma('A PRONTA ENTREGA')), color: 'var(--ready)'}
  ];
  return (
    <section className="kpi-strip">
      {cells.map(c => (
        <button key={c.label} type="button" className="kpi-cell" style={{'--c': c.color}} onClick={() => onGo('producao')}>
          <span>{c.label}</span>
          <b style={c.color ? {color: c.color} : null}>{c.value}</b>
          <small>{c.hint}</small>
        </button>
      ))}
    </section>
  );
}

function LotesNaFabrica({onGo}) {
  const {fila, abrirLote} = useStore();
  const lista = [...fila].sort(
    (a, b) => PRIORIDADE.indexOf(a.status) - PRIORIDADE.indexOf(b.status) || (b.quantidade ?? 0) - (a.quantidade ?? 0)
  );
  return (
    <section>
      <SectionHeader title="Lotes na fábrica" onSeeAll={() => onGo('producao')} seeAllLabel="Abrir quadro" />
      <div className="dtable-wrap">
        {lista.length ? (
          <table className="dtable">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Situação</th>
                <th>Etapa atual</th>
                <th>Cliente</th>
                <th>Material</th>
                <th>Galpão</th>
                <th className="n">Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(o => (
                <tr key={o.key} className={o.legado ? 'sem-lote' : ''} onClick={o.legado ? undefined : () => abrirLote(o.lote)}>
                  <td className="lote">{o.lote ?? 's/ lote'}</td>
                  <td>
                    <Status value={o.status} short />
                  </td>
                  <td>{o.status === 'A PRONTA ENTREGA' ? 'Estoque' : title(o.setor) || '—'}</td>
                  <td className="ell">{title(o.cliente)}</td>
                  <td className="ell">{title(o.material)}</td>
                  <td>{title(o.galpao) || '—'}</td>
                  <td className="n">{kg(o.quantidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="painel-empty">
            Nenhum lote na fábrica. Registre um recebimento para o lote entrar em produção.
            <Button variant="primary" icon="scale" label="Registrar recebimento" onClick={() => onGo('recebimento')} />
          </div>
        )}
      </div>
    </section>
  );
}

function CargaPorEtapa() {
  const {fila} = useStore();
  const etapas = useMemo(() => {
    const mapa = new Map();
    for (const o of fila) {
      if (o.status === 'A PRONTA ENTREGA' || !o.setor) continue;
      const e = mapa.get(o.setor) ?? {setor: o.setor, lotes: 0, peso: 0, parados: 0};
      e.lotes += 1;
      e.peso += o.quantidade ?? 0;
      if (o.status === 'PARADO') e.parados += 1;
      mapa.set(o.setor, e);
    }
    return [...mapa.values()].sort((a, b) => b.peso - a.peso);
  }, [fila]);
  const max = Math.max(...etapas.map(e => e.peso), 1);
  return (
    <section>
      <SectionHeader title="Carga por etapa" />
      <div className="carga">
        {etapas.map(e => (
          <div key={e.setor} className="carga-row">
            <span className="cut">{title(e.setor)}</span>
            <span className="n">{e.lotes}</span>
            <span className="n">{kg(e.peso)}</span>
            <div className="carga-track">
              <div className={e.parados ? 'parado' : ''} style={{width: `${(e.peso / max) * 100}%`}} />
            </div>
          </div>
        ))}
        {!etapas.length && <div className="empty">Nenhuma etapa com material.</div>}
      </div>
    </section>
  );
}

function Tabela({titulo, onSeeAll, colunas, linhas}) {
  return (
    <div>
      <SectionHeader title={titulo} onSeeAll={onSeeAll} />
      <div className="dtable-wrap">
        <table className="dtable">
          <thead>
            <tr>
              {colunas.map(c => (
                <th key={c.label} className={c.n ? 'n' : ''}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.key} onClick={l.onClick}>
                {l.cells.map((cell, i) => (
                  <td key={i} className={colunas[i].n ? 'n' : colunas[i].lote ? 'lote' : 'ell'}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!linhas.length && <div className="empty">Sem dados.</div>}
      </div>
    </div>
  );
}

function Resumos({onGo}) {
  const {lotes, abrirLote} = useStore();
  const {clientes, recentes, divergentes} = useMemo(() => {
    const year = new Date();
    year.setFullYear(year.getFullYear() - 1);
    const since = year.toISOString().slice(0, 10);
    const agg = {};
    for (const l of lotes) {
      if (l.data < since || !l.cliente) continue;
      const a = (agg[l.cliente] ??= {cliente: l.cliente, kg: 0, lotes: 0});
      a.kg += pesado(l);
      a.lotes += 1;
    }
    return {
      clientes: Object.values(agg).sort((a, b) => b.kg - a.kg).slice(0, 5),
      recentes: [...lotes].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5),
      divergentes: lotes
        .map(l => ({l, d: divergencia(l)}))
        .filter(x => x.d && x.d.pct !== 0)
        .sort((a, b) => Math.abs(b.d.pct) - Math.abs(a.d.pct))
        .slice(0, 5)
    };
  }, [lotes]);
  return (
    <section className="painel-tops">
      <Tabela
        titulo="Maiores clientes · 12 meses"
        onSeeAll={() => onGo('relatorios')}
        colunas={[{label: 'Cliente'}, {label: 'Lotes', n: true}, {label: 'Toneladas', n: true}]}
        linhas={clientes.map(c => ({
          key: c.cliente,
          onClick: () => onGo('lotes', {cliente: c.cliente}),
          cells: [title(c.cliente), c.lotes, tons(c.kg)]
        }))}
      />
      <Tabela
        titulo="Últimas entradas"
        onSeeAll={() => onGo('lotes')}
        colunas={[{label: 'Lote', lote: true}, {label: 'Cliente'}, {label: 'Data', n: true}, {label: 'Peso', n: true}]}
        linhas={recentes.map(l => ({
          key: l.lote,
          onClick: () => abrirLote(l.lote),
          cells: [l.lote, title(l.cliente), date(l.data), kg(pesado(l))]
        }))}
      />
      <Tabela
        titulo="Balança × nota fiscal"
        onSeeAll={() => onGo('relatorios')}
        colunas={[{label: 'Lote', lote: true}, {label: 'Material'}, {label: 'Dif.', n: true}, {label: '%', n: true}]}
        linhas={divergentes.map(({l, d}) => ({
          key: l.lote,
          onClick: () => abrirLote(l.lote),
          cells: [l.lote, title(materialDe(l)), kg(d.kg), pct(d.pct)]
        }))}
      />
    </section>
  );
}

export function Painel({onGo}) {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Painel de produção</h1>
          <p className="page-sub">Situação atual dos lotes e das etapas da fábrica.</p>
        </div>
        <div className="page-actions">
          <Button icon="scale" label="Registrar recebimento" onClick={() => onGo('recebimento')} />
          <Button variant="primary" icon="play" label="Apontar processo" onClick={() => onGo('apontar')} />
        </div>
      </div>
      <Indicadores onGo={onGo} />
      <div className="painel-main">
        <LotesNaFabrica onGo={onGo} />
        <CargaPorEtapa />
      </div>
      <BalancoMassa onGo={onGo} />
      <Resumos onGo={onGo} />
    </main>
  );
}
