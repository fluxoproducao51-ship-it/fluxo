import {Fragment, useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {pode} from '../state/perfis.js';
import {date, kg, materialDe, title, tons} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';
import {Chips} from './Producao.jsx';

const VAZIO = {lote: '', de: '', ate: '', cliente: '', material: ''};

// The parent a lot came from by separation, all the way up. Mixes start a family of their own.
function raizDe(lote, porId) {
  let atual = lote;
  const vistos = new Set();
  while (atual.origem?.tipo === 'separacao' && porId.has(atual.origem.pai) && !vistos.has(atual.lote)) {
    vistos.add(atual.lote);
    atual = porId.get(atual.origem.pai);
  }
  return atual;
}

function LinhaEstoque({l, b, filho, extra, onAbrir, acoes}) {
  return (
    <div className={`row stock-row${extra}${filho ? ' estoque-filho' : ''}`}>
      <span className="row-thumb">
        <MaterialCode material={materialDe(l)} tipo={l.tipo} />
      </span>
      <button type="button" className="row-link" onClick={() => onAbrir(l.lote)}>
        {filho && <span className="estoque-ramo">↳ </span>}
        {l.lote}
      </button>
      <span className="cut">
        {title(materialDe(l))}
        <span style={{color: 'var(--subtle)'}}> · {title(l.cliente)}</span>
      </span>
      <span className="num hide-sm" style={{color: 'var(--muted)'}}>{kg(b.est + b.enviado + (b.misturado || 0))}</span>
      <span className="num hide-md" style={{color: 'var(--muted)'}}>{kg(b.enviado)}</span>
      <span className="num" style={{fontWeight: 600}}>{kg(b.est)}</span>
      <span className="acoes-lote">{acoes(l)}</span>
    </div>
  );
}

export function Estoque() {
  const {lotes, balances, envios, abrirLote, openDialog, loteDe, perfil} = useStore();
  const excluir = pode(perfil, 'excluirLote');
  const extra = excluir ? ' com-excluir' : '';
  const [visao, setVisao] = useState('pai');
  const [filtro, setFiltro] = useState(VAZIO);
  const [abertos, setAbertos] = useState(() => new Set());
  const set = chave => e => setFiltro(f => ({...f, [chave]: e.target.value}));
  const filtrando = Object.values(filtro).some(Boolean);

  const porId = useMemo(() => new Map(lotes.map(l => [l.lote, l])), [lotes]);
  const clientes = useMemo(() => [...new Set(lotes.map(l => l.cliente).filter(Boolean))].sort(), [lotes]);
  const materiais = useMemo(() => [...new Set(lotes.flatMap(l => l.materiais))].filter(Boolean).sort(), [lotes]);

  const passa = l => {
    const q = filtro.lote.trim().toUpperCase();
    if (q && !l.lote.toUpperCase().includes(q) && !raizDe(l, porId).lote.toUpperCase().includes(q)) return false;
    if (filtro.de && l.data < filtro.de) return false;
    if (filtro.ate && l.data > filtro.ate) return false;
    if (filtro.cliente && l.cliente !== filtro.cliente) return false;
    if (filtro.material && !l.materiais.includes(filtro.material)) return false;
    return true;
  };

  const emEstoque = useMemo(
    () =>
      lotes
        .map(l => ({l, b: balances.get(l.lote)}))
        .filter(({l, b}) => b?.est > 0 && passa(l))
        .sort((x, y) => y.b.est - x.b.est),
    [lotes, balances, filtro, porId]
  );

  // One row per parent lot, with the stock of the whole family; the lots in stock open under it.
  const familias = useMemo(() => {
    const grupos = new Map();
    for (const item of emEstoque) {
      const raiz = raizDe(item.l, porId);
      const g = grupos.get(raiz.lote) ?? {raiz, itens: [], est: 0, entrou: 0, enviado: 0};
      g.itens.push(item);
      g.est += item.b.est;
      g.entrou += item.b.est + item.b.enviado + (item.b.misturado || 0);
      grupos.set(raiz.lote, g);
    }
    for (const g of grupos.values()) {
      g.itens.sort((x, y) => (x.l.lote === g.raiz.lote ? -1 : y.l.lote === g.raiz.lote ? 1 : x.l.lote.localeCompare(y.l.lote)));
      g.enviado = lotes.filter(l => raizDe(l, porId).lote === g.raiz.lote).reduce((s, l) => s + (balances.get(l.lote)?.enviado ?? 0), 0);
    }
    return [...grupos.values()].sort((a, b) => b.est - a.est);
  }, [emEstoque, porId, lotes, balances]);

  const total = emEstoque.reduce((s, x) => s + x.b.est, 0);
  const historico = useMemo(
    () =>
      envios
        .filter(e => {
          const l = loteDe(e.lote);
          if (!l) return !filtrando;
          const q = filtro.lote.trim().toUpperCase();
          if (q && !e.lote.toUpperCase().includes(q) && !raizDe(l, porId).lote.toUpperCase().includes(q)) return false;
          if (filtro.de && e.data < filtro.de) return false;
          if (filtro.ate && e.data > filtro.ate) return false;
          if (filtro.cliente && l.cliente !== filtro.cliente && e.cliente !== filtro.cliente) return false;
          if (filtro.material && !l.materiais.includes(filtro.material)) return false;
          return true;
        })
        .sort((a, b) => b.data.localeCompare(a.data)),
    [envios, filtro, porId, lotes]
  );
  const enviado = historico.reduce((s, e) => s + e.peso, 0);

  const alternar = id =>
    setAbertos(atual => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const acoes = l => (
    <>
      {pode(perfil, 'enviar') && <Button variant="secondary" size="sm" icon="truck" label="Enviar" onClick={() => openDialog({tipo: 'envio', lote: l.lote})} />}
      {excluir && (
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          className="btn-icone"
          aria-label={`Excluir lote ${l.lote}`}
          title="Excluir lote"
          onClick={() => openDialog({tipo: 'excluirLote', lote: l.lote})}
        />
      )}
    </>
  );

  return (
    <main className="page" style={{gap: 32}}>
      <div>
        <h1 className="page-title">Estoque e envios</h1>
        <p className="page-sub">Produto acabado disponível por lote. Envie o lote inteiro ou só uma parte.</p>
      </div>

      <section className="estoque-filtros panel">
        <label className="field">
          <span>Lote</span>
          <input className="input" value={filtro.lote} onChange={set('lote')} placeholder="Número do lote" />
        </label>
        <label className="field">
          <span>Data de</span>
          <input className="input" type="date" value={filtro.de} onChange={set('de')} />
        </label>
        <label className="field">
          <span>Até</span>
          <input className="input" type="date" value={filtro.ate} onChange={set('ate')} />
        </label>
        <label className="field">
          <span>Cliente</span>
          <select className="input" value={filtro.cliente} onChange={set('cliente')}>
            <option value="">Todos</option>
            {clientes.map(c => (
              <option key={c} value={c}>
                {title(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Material</span>
          <select className="input" value={filtro.material} onChange={set('material')}>
            <option value="">Todos</option>
            {materiais.map(m => (
              <option key={m} value={m}>
                {title(m)}
              </option>
            ))}
          </select>
        </label>
        {filtrando && <Button variant="ghost" icon="x" label="Limpar filtros" onClick={() => setFiltro(VAZIO)} />}
      </section>

      <section className="kpis" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
        <div className="kpi">
          <span>Disponível em estoque</span>
          <b>{tons(total)} t</b>
          <small>
            {emEstoque.length} {emEstoque.length === 1 ? 'lote' : 'lotes'} · {familias.length} {familias.length === 1 ? 'lote pai' : 'lotes pai'}
          </small>
        </div>
        <div className="kpi">
          <span>Já enviado a clientes</span>
          <b>{tons(enviado)} t</b>
          <small>{historico.length} envios</small>
        </div>
        <div className="kpi">
          <span>Maior saldo</span>
          <b>{emEstoque[0] ? emEstoque[0].l.lote : '—'}</b>
          <small>{emEstoque[0] ? `${title(materialDe(emEstoque[0].l))} · ${kg(emEstoque[0].b.est)}` : ''}</small>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">Lotes em estoque</h2>
          <Chips
            id="estoque-visao"
            value={visao}
            onChange={setVisao}
            options={[
              {value: 'pai', label: 'Só lotes pai'},
              {value: 'todos', label: 'Todos os lotes'}
            ]}
          />
        </div>
        <div className="rows">
          <div className={`row row-head stock-row${extra}`} style={{background: 'none'}}>
            <span />
            <span>Lote</span>
            <span>Material</span>
            <span className="num hide-sm">Entrou</span>
            <span className="num hide-md">Enviado</span>
            <span className="num">Saldo</span>
            <span />
          </div>
          {visao === 'todos'
            ? emEstoque.map(({l, b}) => <LinhaEstoque key={l.lote} l={l} b={b} extra={extra} onAbrir={abrirLote} acoes={acoes} />)
            : familias.map(g => {
                const so = g.itens.length === 1 && g.itens[0].l.lote === g.raiz.lote;
                if (so) {
                  const {l, b} = g.itens[0];
                  return <LinhaEstoque key={l.lote} l={l} b={b} extra={extra} onAbrir={abrirLote} acoes={acoes} />;
                }
                const aberto = abertos.has(g.raiz.lote);
                const filhos = g.itens.filter(x => x.l.lote !== g.raiz.lote).length;
                return (
                  <Fragment key={g.raiz.lote}>
                    <div
                      role="button"
                      title={`${filhos} ${filhos === 1 ? 'lote filho' : 'lotes filhos'} em estoque`}
                      tabIndex={0}
                      aria-expanded={aberto}
                      className={`row stock-row${extra} estoque-pai ${aberto ? 'aberto' : ''}`}
                      onClick={() => alternar(g.raiz.lote)}
                      onKeyDown={e => e.key === 'Enter' && alternar(g.raiz.lote)}
                    >
                      <span className="row-thumb">
                        <MaterialCode material={materialDe(g.raiz)} tipo={g.raiz.tipo} />
                      </span>
                      <span className="estoque-pai-nome">
                        <Icon name={aberto ? 'chevronDown' : 'chevronRight'} size={14} />
                        <b className="mono">{g.raiz.lote}</b>
                        <small className="estoque-filhos-n">+{filhos}</small>
                      </span>
                      <span className="cut">
                        {title(materialDe(g.raiz))}
                        <span style={{color: 'var(--subtle)'}}> · {title(g.raiz.cliente)}</span>
                      </span>
                      <span className="num hide-sm" style={{color: 'var(--muted)'}}>{kg(g.entrou)}</span>
                      <span className="num hide-md" style={{color: 'var(--muted)'}}>{kg(g.enviado)}</span>
                      <span className="num" style={{fontWeight: 600}}>{kg(g.est)}</span>
                      <span className="acoes-lote estoque-pai-dica">{aberto ? 'Fechar' : 'Ver lotes'}</span>
                    </div>
                    {aberto &&
                      g.itens.map(({l, b}) => (
                        <LinhaEstoque key={l.lote} l={l} b={b} filho={l.lote !== g.raiz.lote} extra={extra} onAbrir={abrirLote} acoes={acoes} />
                      ))}
                  </Fragment>
                );
              })}
          {!emEstoque.length && (
            <div className="empty">{filtrando ? 'Nenhum lote em estoque com esses filtros.' : 'Nada em estoque. Aponte um processo com destino “Estoque”.'}</div>
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Envios aos clientes" />
        <div className="rows">
          {historico.map(e => {
            const l = loteDe(e.lote);
            return (
              <button key={e.id} type="button" className="row env-row" onClick={() => abrirLote(e.lote)}>
                <span style={{color: 'var(--muted)'}}>{date(e.data, true)}</span>
                <span style={{fontWeight: 600}}>{e.lote}</span>
                <span className="cut">{title(e.cliente)}</span>
                <span className="cut hide-sm" style={{color: 'var(--muted)'}}>{l ? title(materialDe(l)) : ''}</span>
                <span className="hide-md" style={{color: 'var(--muted)'}}>NF {e.nf ?? '—'}</span>
                <span className="num" style={{fontWeight: 600}}>{kg(e.peso)}</span>
              </button>
            );
          })}
          {!historico.length && <div className="empty">{filtrando ? 'Nenhum envio com esses filtros.' : 'Nenhum envio registrado ainda.'}</div>}
        </div>
      </section>
    </main>
  );
}
