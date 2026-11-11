import {useMemo} from 'react';
import {motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {MESES, MESES_LONGOS, date, divergencia, kg, pct, pesado, title, tons} from '../state/data.js';
import {horas, obtidoDe, perdasDe, quebraDe} from '../state/balance.js';
import {SectionHeader} from '../ui/SectionHeader.jsx';

const EASE_OUT = [0.16, 1, 0.3, 1];

// Loss kinds are registered by the office, so the colours cycle; unclassified loss is always grey and last.
const CORES_PERDA = ['var(--ready)', 'var(--stop)', 'var(--stock)', 'var(--accent)', '#7a5c99', '#3d8b7a', '#b5651d', '#5d6d7e'];
const SEM_CATEGORIA = 'Sem categoria';

const sinal = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const kgSinal = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${kg(Math.abs(n))}`;

function HBars({rows}) {
  if (!rows.length) return <div className="empty">Sem recebimentos no período.</div>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={r.label} className="hbar">
          <span className="hbar-lbl" title={r.label}>
            {r.label}
          </span>
          <div className="track">
            <motion.div
              className="fill"
              initial={{scaleX: 0}}
              animate={{scaleX: r.value / max}}
              transition={{duration: 0.8, ease: EASE_OUT, delay: 0.04 * i}}
            />
          </div>
          <span className="v">{tons(r.value)} t</span>
        </div>
      ))}
    </div>
  );
}

function MonthBars({months, peak}) {
  const max = Math.max(...months.map(m => m.kg), 1);
  return (
    <div className="bars">
      {months.map((m, i) => (
        <div
          key={m.key}
          className={`bar-col ${i === peak && m.kg ? 'peak' : ''}`}
          title={`${MESES_LONGOS[m.mes]} de ${m.ano}: ${kg(m.kg)} em ${m.lotes} ${m.lotes === 1 ? 'lote' : 'lotes'}`}
        >
          <div className="bar-area">
            <span className="bar-val">{m.kg ? tons(m.kg) : '–'}</span>
            <motion.div
              className="bar"
              style={{height: `${Math.max(1.5, (m.kg / max) * 100)}%`}}
              initial={{scaleY: 0}}
              animate={{scaleY: 1}}
              transition={{duration: 0.7, ease: EASE_OUT, delay: 0.04 * i}}
            />
          </div>
          <span className="bar-lbl">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Relatorios() {
  const {lotes, apontamentos, abrirLote} = useStore();
  const r = useMemo(() => {
    const now = new Date();
    const months = Array.from({length: 12}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MESES[d.getMonth()],
        mes: d.getMonth(),
        ano: d.getFullYear(),
        kg: 0,
        lotes: 0
      };
    });
    const index = Object.fromEntries(months.map((m, i) => [m.key, i]));
    const noPeriodo = iso => iso && index[iso.slice(0, 7)] != null;
    // Separations and mixes become lots too, but their material was already received once.
    const recebidos = lotes.filter(l => !l.origem && noPeriodo(l.data));
    const cli = {};
    const mat = {};
    const divCli = {};
    let benef = 0;
    let comTipo = 0;
    let all = 0;
    const diffs = [];
    for (const l of recebidos) {
      const w = pesado(l);
      const m = months[index[l.data.slice(0, 7)]];
      m.kg += w;
      m.lotes += 1;
      all += w;
      if (l.compra) comTipo += w;
      if (l.compra === 'BENEFICIAMENTO') benef += w;
      cli[l.cliente] = (cli[l.cliente] ?? 0) + w;
      const material = l.materiais[0] ?? 'SEM MATERIAL';
      mat[material] = (mat[material] ?? 0) + w;
      const d = divergencia(l);
      if (d) {
        diffs.push({...d, lote: l.lote, cliente: l.cliente, data: l.data, nf: l.pesoNF});
        const c = (divCli[l.cliente] ??= {cliente: l.cliente, lotes: 0, nf: 0, balanca: 0});
        c.lotes += 1;
        c.nf += l.pesoNF;
        c.balanca += w;
      }
    }
    const top = obj =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({label: title(label), value}));

    const etapas = {};
    const perdas = {};
    let usado = 0;
    let obtido = 0;
    for (const ap of apontamentos) {
      if (!noPeriodo(ap.data)) continue;
      const e = (etapas[ap.setor] ??= {setor: ap.setor, n: 0, usado: 0, obtido: 0, quebra: 0, horas: 0});
      const q = quebraDe(ap);
      e.n += 1;
      e.usado += ap.usado;
      e.obtido += obtidoDe(ap);
      e.quebra += q;
      e.horas += horas(ap);
      usado += ap.usado;
      obtido += obtidoDe(ap);
      let classificado = 0;
      for (const [tipo, peso] of Object.entries(perdasDe(ap))) {
        perdas[tipo] = (perdas[tipo] ?? 0) + peso;
        classificado += peso;
      }
      if (q > classificado) perdas[SEM_CATEGORIA] = (perdas[SEM_CATEGORIA] ?? 0) + q - classificado;
    }

    const ult3 = months.slice(-3).reduce((s, m) => s + m.kg, 0) / 3;
    const ant3 = months.slice(-6, -3).reduce((s, m) => s + m.kg, 0) / 3;
    return {
      months,
      all,
      count: recebidos.length,
      tendencia: ant3 ? ult3 / ant3 - 1 : null,
      benefShare: comTipo ? benef / comTipo : null,
      avgDiff: diffs.length ? diffs.reduce((s, d) => s + Math.abs(d.pct), 0) / diffs.length : null,
      saldoDiff: diffs.reduce((s, d) => s + d.kg, 0),
      nDiff: diffs.length,
      piores: [...diffs].sort((a, b) => Math.abs(b.kg) - Math.abs(a.kg)).slice(0, 6),
      divClientes: Object.values(divCli)
        .map(c => ({...c, kg: c.balanca - c.nf, pct: (c.balanca - c.nf) / c.nf}))
        .sort((a, b) => Math.abs(b.kg) - Math.abs(a.kg))
        .slice(0, 6),
      clientes: top(cli),
      materiais: top(mat),
      etapas: Object.values(etapas).sort((a, b) => b.usado - a.usado),
      perdas: Object.entries(perdas)
        .filter(([, peso]) => peso > 0)
        .sort(([a, x], [b, y]) => (a === SEM_CATEGORIA) - (b === SEM_CATEGORIA) || y - x)
        .map(([tipo, peso], i) => ({
          key: tipo,
          label: tipo === SEM_CATEGORIA ? tipo : title(tipo),
          peso,
          color: tipo === SEM_CATEGORIA ? 'var(--subtle)' : CORES_PERDA[i % CORES_PERDA.length]
        })),
      perdaTotal: Object.values(perdas).reduce((s, v) => s + v, 0),
      usado,
      rendimento: usado ? obtido / usado : null
    };
  }, [lotes, apontamentos]);
  const peak = r.months.reduce((best, m, i) => (m.kg > r.months[best].kg ? i : best), 0);
  const pico = r.months[peak];

  return (
    <main className="page">
      <div>
        <h1 className="page-title">Relatórios</h1>
        <p className="page-sub">
          Últimos 12 meses, de {MESES_LONGOS[r.months[0].mes]} de {r.months[0].ano} a {MESES_LONGOS[r.months[11].mes]} de{' '}
          {r.months[11].ano}.
        </p>
      </div>
      <section className="kpis">
        <div className="kpi">
          <span>Recebido</span>
          <b>{tons(r.all)} t</b>
          <small>
            {r.count} {r.count === 1 ? 'lote' : 'lotes'}
          </small>
        </div>
        <div className="kpi">
          <span>Média por mês</span>
          <b>{tons(r.all / 12)} t</b>
          <small>
            {pico.kg ? `pico em ${pico.label}/${String(pico.ano).slice(2)}` : 'sem recebimentos'}
            {r.tendencia != null && (
              <>
                {' · '}
                <em className={sinal(r.tendencia)}>{pct(r.tendencia)}</em> no último trimestre
              </>
            )}
          </small>
        </div>
        <div className="kpi">
          <span>Beneficiamento</span>
          <b>{pct(r.benefShare).replace('+', '')}</b>
          <small>do peso com tipo de compra informado</small>
        </div>
        <div className="kpi">
          <span>Divergência NF × balança</span>
          <b>{pct(r.avgDiff).replace('+', '')}</b>
          <small>
            média por lote · saldo <em className={sinal(r.saldoDiff)}>{kgSinal(r.saldoDiff)}</em>
          </small>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2 className="section-title">Recebido por mês</h2>
          <span className="section-note">toneladas</span>
        </div>
        <MonthBars months={r.months} peak={peak} />
      </section>

      <section className="grid-2 even">
        <div className="panel">
          <SectionHeader title="Por cliente" />
          <HBars rows={r.clientes} />
        </div>
        <div className="panel">
          <SectionHeader title="Por material" />
          <HBars rows={r.materiais} />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2 className="section-title">Divergência NF × balança</h2>
          <span className="section-note">
            {r.nDiff} de {r.count} lotes com peso da NF
          </span>
        </div>
        {r.nDiff ? (
          <div className="grid-2 even">
            <div>
              <p className="label">Por cliente</p>
              <div className="rtable">
                <div className="rrow rhead div-cli">
                  <span>Cliente</span>
                  <span className="n hide-sm">NF</span>
                  <span className="n hide-sm">Balança</span>
                  <span className="n">Diferença</span>
                </div>
                {r.divClientes.map(c => (
                  <div key={c.cliente} className="rrow div-cli">
                    <span className="ell">
                      {title(c.cliente)}
                      <small> · {c.lotes} {c.lotes === 1 ? 'lote' : 'lotes'}</small>
                    </span>
                    <span className="n hide-sm">{kg(c.nf)}</span>
                    <span className="n hide-sm">{kg(c.balanca)}</span>
                    <span className={`n ${sinal(c.kg)}`}>
                      {kgSinal(c.kg)} <small>{pct(c.pct)}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Maiores diferenças por lote</p>
              <div className="rtable">
                {r.piores.map(d => (
                  <button
                    key={d.lote}
                    type="button"
                    className="rrow div-lote"
                    onClick={() => abrirLote(d.lote)}
                  >
                    <span className="ell">
                      Lote {d.lote}
                      <small>
                        {' '}
                        · {title(d.cliente)} · {date(d.data)}
                      </small>
                    </span>
                    <span className="n hide-sm">NF {kg(d.nf)}</span>
                    <span className={`n ${sinal(d.kg)}`}>
                      {kgSinal(d.kg)} <small>{pct(d.pct)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">Nenhum lote com peso da NF no período.</div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <h2 className="section-title">Rendimento da produção</h2>
          <span className="section-note">
            {r.rendimento != null && `${pct(r.rendimento).replace('+', '')} aproveitado de ${tons(r.usado)} t processadas`}
          </span>
        </div>
        {r.etapas.length ? (
          <>
            <div className="rtable">
              <div className="rrow rhead etapa">
                <span>Etapa</span>
                <span className="n hide-sm">Apont.</span>
                <span className="n">Processado</span>
                <span className="n">Rendimento</span>
                <span className="n hide-sm">Quebra</span>
                <span className="n hide-sm">kg/h</span>
              </div>
              {r.etapas.map(e => (
                <div key={e.setor} className="rrow etapa">
                  <span className="ell">{title(e.setor)}</span>
                  <span className="n hide-sm">{e.n}</span>
                  <span className="n">{kg(e.usado)}</span>
                  <span className="n">{pct(e.obtido / e.usado).replace('+', '')}</span>
                  <span className="n hide-sm">{kg(e.quebra)}</span>
                  <span className="n hide-sm">{e.horas ? kg(e.usado / e.horas).replace(' kg', '') : '—'}</span>
                </div>
              ))}
            </div>
            {r.perdaTotal > 0 && (
              <div className="perdas">
                <p className="label">Composição das perdas · {kg(r.perdaTotal)}</p>
                <div className="stack">
                  {r.perdas.map(p => (
                    <motion.div
                      key={p.key}
                      style={{background: p.color, flexGrow: p.peso}}
                      initial={{opacity: 0}}
                      animate={{opacity: 1}}
                      title={`${p.label}: ${kg(p.peso)}`}
                    />
                  ))}
                </div>
                <div className="legend">
                  {r.perdas.map(p => (
                    <span key={p.key}>
                      <i style={{background: p.color}} />
                      {p.label} <b>{kg(p.peso)}</b>
                      <small>{pct(p.peso / r.perdaTotal).replace('+', '')}</small>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty">Nenhum processo finalizado no período.</div>
        )}
      </section>

    </main>
  );
}
