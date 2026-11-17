import {useMemo} from 'react';
import {useStore} from '../state/store.jsx';
import {date, divergencia, kg, materialDe, pct, pesado, title, today} from '../state/data.js';
import {horasLiquidas, pausado} from '../state/balance.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';
import {Status} from '../ui/Status.jsx';

// A lot waiting longer than this without moving needs a decision.
const DIAS_FILA = 7;
const LIMITE_DIVERGENCIA = 0.05;

const diasDesde = iso => Math.floor((Date.parse(today()) - Date.parse(iso)) / 86400000);
const horaDe = iso => new Date(iso).toTimeString().slice(0, 5);

function Indicadores({acoes}) {
  const {fila} = useStore();
  const conta = status => fila.filter(o => o.status === status).length;
  const peso = status => fila.filter(o => o.status === status).reduce((s, o) => s + (o.quantidade ?? 0), 0);
  const cells = [
    {label: 'Precisam de ação', value: acoes, hint: 'veja a lista abaixo', color: acoes ? 'var(--stop)' : 'var(--ok)'},
    {label: 'Em processo', value: conta('EM PROCESSO'), hint: kg(peso('EM PROCESSO')), color: 'var(--run)'},
    {label: 'Parados', value: conta('PARADO'), hint: kg(peso('PARADO')), color: conta('PARADO') ? 'var(--stop)' : undefined},
    {label: 'Na fila', value: conta('AGUARDANDO INICIO'), hint: kg(peso('AGUARDANDO INICIO')), color: 'var(--wait)'},
    {label: 'Pronto para entrega', value: conta('A PRONTA ENTREGA'), hint: kg(peso('A PRONTA ENTREGA')), color: 'var(--ready)'}
  ];
  return (
    <section className="kpi-strip">
      {cells.map(c => (
        <div key={c.label} className="kpi-cell" style={{'--c': c.color}}>
          <span>{c.label}</span>
          <b style={c.color ? {color: c.color} : null}>{c.value}</b>
          <small>{c.hint}</small>
        </div>
      ))}
    </section>
  );
}

// What the PCP has to decide now, most urgent first.
function useAcoes() {
  const {lotes, balances, abertos} = useStore();
  return useMemo(() => {
    const lista = [];
    for (const p of abertos) {
      if (!pausado(p)) continue;
      const pausa = p.pausas.find(x => !x.fim);
      lista.push({
        id: `parado-${p.id}`,
        ordem: 0,
        lote: p.lote,
        tipo: 'Parado',
        cor: 'var(--stop)',
        texto: `${title(p.setor)} parada por ${title(pausa.motivo).toLowerCase()} desde ${horaDe(pausa.inicio)}, com ${kg(p.usado)} na máquina.${pausa.obs ? ` ${pausa.obs}.` : ''}`,
        botao: 'Ver no mapa'
      });
    }
    for (const l of lotes) {
      const b = balances.get(l.lote);
      if (!b?.aberto) continue;
      if (!b.rota.length && b.pend > 0) {
        lista.push({
          id: `rota-${l.lote}`,
          ordem: 1,
          lote: l.lote,
          tipo: 'Sem rota',
          cor: 'var(--stop)',
          texto: `${kg(b.pend)} de ${title(materialDe(l)).toLowerCase()} sem rota. O operador não consegue iniciar este lote.`,
          botao: 'Definir rota'
        });
        continue;
      }
      const ultimo = b.apontamentos.reduce((d, a) => (a.data > d ? a.data : d), l.data);
      const dias = diasDesde(ultimo);
      if (b.pend > 0 && !b.processo && dias >= DIAS_FILA) {
        lista.push({
          id: `fila-${l.lote}`,
          ordem: 2,
          dias,
          lote: l.lote,
          tipo: 'Fila parada',
          cor: 'var(--ready)',
          texto: `${kg(b.pend)} aguardando ${title(b.rota[b.proxima])} há ${dias} dias sem movimento.`,
          botao: 'Ver no mapa'
        });
      }
      const d = divergencia(l);
      if (d && l.novo && Math.abs(d.pct) > LIMITE_DIVERGENCIA) {
        lista.push({
          id: `nf-${l.lote}`,
          ordem: 3,
          lote: l.lote,
          tipo: 'Peso × NF',
          cor: 'var(--ready)',
          texto: `Balança ${pct(d.pct)} em relação à nota fiscal (${kg(d.kg)}).`,
          botao: 'Ver no mapa'
        });
      }
    }
    return lista.sort((a, b) => a.ordem - b.ordem || (b.dias ?? 0) - (a.dias ?? 0));
  }, [lotes, balances, abertos]);
}

function Acoes({lista, onGo}) {
  return (
    <section>
      <SectionHeader title="Precisa de ação" />
      <div className="acoes">
        {lista.map(a => (
          <div key={a.id} className="acao" style={{'--c': a.cor}}>
            <span className="acao-tipo">{a.tipo}</span>
            <b className="mono">{a.lote}</b>
            <span className="acao-texto">{a.texto}</span>
            <Button size="sm" icon="flow" label={a.botao} onClick={() => onGo('mapa', {lote: a.lote})} />
          </div>
        ))}
        {!lista.length && (
          <div className="empty">
            <Icon name="check" size={16} style={{verticalAlign: -3, marginRight: 6}} />
            Nenhuma pendência. Todos os lotes estão andando.
          </div>
        )}
      </div>
    </section>
  );
}

function FilaPorMaquina({onGo}) {
  const {lotes, balances, abertos, fila, ativos} = useStore();
  const maquinas = useMemo(() => {
    const mapa = new Map(ativos('processos').map(nome => [nome, {nome, rodando: [], fila: []}]));
    const de = nome => {
      if (!mapa.has(nome)) mapa.set(nome, {nome, rodando: [], fila: []});
      return mapa.get(nome);
    };
    for (const p of abertos) de(p.setor).rodando.push(p);
    for (const l of [...lotes].sort((a, b) => a.data.localeCompare(b.data))) {
      const b = balances.get(l.lote);
      if (!b?.aberto) continue;
      b.steps.forEach(s => {
        if (s.setor && s.pend > 0) de(s.setor).fila.push({lote: l.lote, peso: s.pend, bags: s.bags?.length});
      });
    }
    // Orders from the old spreadsheet board that never got a lot of their own.
    for (const o of fila) {
      if (o.legado && o.setor) de(o.setor).fila.push({lote: o.lote ?? 's/ lote', peso: o.quantidade ?? 0, semLote: !lotes.some(l => l.lote === o.lote)});
    }
    return [...mapa.values()];
  }, [lotes, balances, abertos, fila]);
  const agora = Date.now();
  return (
    <section>
      <SectionHeader title="Fila por máquina" />
      <div className="dtable-wrap">
        <table className="dtable sem-hover">
          <thead>
            <tr>
              <th>Máquina</th>
              <th>Situação</th>
              <th>Rodando agora</th>
              <th>Fila (mais antigo primeiro)</th>
              <th className="n">Carga</th>
            </tr>
          </thead>
          <tbody>
            {maquinas.map(m => {
              const parada = m.rodando.some(pausado);
              const carga = [...m.rodando.map(p => p.usado), ...m.fila.map(f => f.peso)].reduce((s, v) => s + v, 0);
              return (
                <tr key={m.nome}>
                  <td style={{fontWeight: 500}}>{title(m.nome)}</td>
                  <td>
                    {parada ? (
                      <Status value="PARADO" short />
                    ) : m.rodando.length ? (
                      <Status value="EM PROCESSO" short />
                    ) : (
                      <span className="maq-livre">{m.fila.length ? 'Livre, com fila' : 'Livre'}</span>
                    )}
                  </td>
                  <td>
                    {m.rodando.map(p => (
                      <button key={p.id} type="button" className="maq-rodando" onClick={() => onGo('mapa', {lote: p.lote})}>
                        <b className="mono">{p.bags ? [...new Set(p.bags.map(e => e.lote))].join(', ') : p.lote}</b>
                        {p.bags ? ` · ${p.bags.length} ${p.bags.length === 1 ? 'bag' : 'bags'}` : ''} {title(p.operador)} ·{' '}
                        {horasLiquidas(p, agora).toLocaleString('pt-BR', {maximumFractionDigits: 1})} h
                      </button>
                    ))}
                    {!m.rodando.length && <span className="maq-livre">—</span>}
                  </td>
                  <td className="maq-fila">
                    {m.fila.map(f =>
                      f.semLote ? (
                        <span key={`${f.lote}-${f.peso}`} className="lote-chip off">{f.lote}</span>
                      ) : (
                        <button key={f.lote} type="button" className="lote-chip" title={kg(f.peso)} onClick={() => onGo('mapa', {lote: f.lote})}>
                          {f.lote}
                          {f.bags ? ` · ${f.bags} ${f.bags === 1 ? 'bag' : 'bags'}` : ''}
                        </button>
                      )
                    )}
                    {!m.fila.length && <span className="maq-livre">—</span>}
                  </td>
                  <td className="n">{carga ? kg(carga) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Entradas({onGo}) {
  const {lotes, balances} = useStore();
  const lista = useMemo(
    () =>
      lotes
        .filter(l => {
          const b = balances.get(l.lote);
          return b?.aberto && !l.origem && b.pend > 0 && !b.processo && !b.apontamentos.length;
        })
        .sort((a, b) => b.data.localeCompare(a.data))
        .slice(0, 10),
    [lotes, balances]
  );
  return (
    <section>
      <SectionHeader title="Recebidos sem início" />
      <div className="dtable-wrap">
        {lista.length ? (
          <table className="dtable">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Recebido</th>
                <th>Cliente</th>
                <th>Material</th>
                <th>Rota prevista</th>
                <th className="n">Peso</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(l => (
                <tr key={l.lote} onClick={() => onGo('mapa', {lote: l.lote})}>
                  <td className="lote">{l.lote}</td>
                  <td>{date(l.data)}</td>
                  <td className="ell">{title(l.cliente)}</td>
                  <td className="ell">{title(materialDe(l))}</td>
                  <td className="rota-cel">{balances.get(l.lote).rota.map(title).join(' → ') || 'Sem rota'}</td>
                  <td className="n">{kg(pesado(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">Todo material recebido já entrou em produção.</div>
        )}
      </div>
    </section>
  );
}

export function Pcp({onGo}) {
  const acoes = useAcoes();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Central do PCP</h1>
          <p className="page-sub">O que decidir agora, a carga de cada máquina e o que chegou da logística.</p>
        </div>
        <div className="page-actions">
          <Button icon="factory" label="Quadro de produção" onClick={() => onGo('producao')} />
          <Button variant="primary" icon="flow" label="Abrir mapa do lote" onClick={() => onGo('mapa')} />
        </div>
      </div>
      <Indicadores acoes={acoes.length} />
      <Acoes lista={acoes} onGo={onGo} />
      <FilaPorMaquina onGo={onGo} />
      <Entradas onGo={onGo} />
    </main>
  );
}
