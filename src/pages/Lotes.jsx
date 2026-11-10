import {useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {date, divergencia, kg, materialDe, pct, pesado, title} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {Menu, MenuDivider, MenuItem} from '../ui/Menu.jsx';
import {Status} from '../ui/Status.jsx';
import {pode} from '../state/perfis.js';
import {Chips} from './Producao.jsx';

const PAGE = 40;

export function Lotes({initial}) {
  const {lotes, statusDe, abrirLote, openDialog, perfil} = useStore();
  const excluir = pode(perfil, 'excluirLote');
  const extra = excluir ? ' com-excluir' : '';
  const [query, setQuery] = useState('');
  const [cliente, setCliente] = useState(initial?.cliente ?? null);
  const [compra, setCompra] = useState('TODAS');
  const [menu, setMenu] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const clientes = useMemo(() => [...new Set(lotes.map(l => l.cliente).filter(Boolean))].sort(), [lotes]);
  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    return [...lotes]
      .filter(l => !cliente || l.cliente === cliente)
      .filter(l => compra === 'TODAS' || l.compra === compra)
      .filter(
        l =>
          !q ||
          l.lote.includes(q) ||
          (l.cliente ?? '').includes(q) ||
          l.materiais.some(m => m.includes(q)) ||
          String(l.nf ?? '').includes(q)
      )
      .sort((a, b) => b.data.localeCompare(a.data) || b.lote.localeCompare(a.lote));
  }, [lotes, query, cliente, compra]);
  const total = list.reduce((s, l) => s + pesado(l), 0);

  return (
    <main className="page" style={{gap: 28}}>
      <div>
        <h1 className="page-title">Lotes</h1>
        <p className="page-sub">
          {list.length} lotes · {kg(total)} pesados
        </p>
      </div>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por lote, cliente, material ou NF"
            autoFocus
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Limpar">
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
        <div className="menu-wrap">
          <Button
            variant="secondary"
            icon="filter"
            label={cliente ? 'Cliente' : 'Todos os clientes'}
            onClick={() => setMenu(m => !m)}
          >
            <Icon name={menu ? 'chevronUp' : 'chevronDown'} size={14} />
          </Button>
          <Menu open={menu} onClose={() => setMenu(false)}>
            <MenuItem label="Todos os clientes" checked={!cliente} onSelect={() => (setCliente(null), setMenu(false))} />
            <MenuDivider />
            {clientes.map(c => (
              <MenuItem key={c} label={title(c)} checked={cliente === c} onSelect={() => (setCliente(c), setMenu(false))} />
            ))}
          </Menu>
        </div>
        {cliente && (
          <button type="button" className="chip-x" onClick={() => setCliente(null)}>
            {title(cliente)}
            <Icon name="x" size={12} stroke={2.5} />
          </button>
        )}
        <Chips
          id="compra-pill"
          value={compra}
          onChange={setCompra}
          options={[
            {value: 'TODAS', label: 'Todas'},
            {value: 'PRODUTO', label: 'Produto'},
            {value: 'BENEFICIAMENTO', label: 'Beneficiamento'}
          ]}
        />
      </div>

      <section className="rows">
        <div className={`row row-head${extra}`} style={{background: 'none'}}>
          <span />
          <span>Lote</span>
          <span>Cliente</span>
          <span className="hide-sm">Material</span>
          <span className="num hide-md">Data</span>
          <span className="num">Peso</span>
          <span className="num hide-md">NF × bal.</span>
          <span className="hide-sm">Status</span>
          {excluir && <span />}
        </div>
        {list.slice(0, limit).map(l => {
          const diff = divergencia(l);
          return (
            <div
              key={l.lote}
              role="button"
              tabIndex={0}
              className={`row${extra}`}
              onClick={() => abrirLote(l.lote)}
              onKeyDown={e => e.target === e.currentTarget && e.key === 'Enter' && abrirLote(l.lote)}
            >
              <span className="row-thumb">
                <MaterialCode material={materialDe(l)} tipo={l.tipo} />
              </span>
              <span style={{fontWeight: 600}}>{l.lote}</span>
              <span className="cut">{title(l.cliente)}</span>
              <span className="cut hide-sm" style={{color: 'var(--muted)'}}>{title(materialDe(l))}</span>
              <span className="num hide-md" style={{color: 'var(--muted)'}}>{date(l.data, true)}</span>
              <span className="num">{kg(pesado(l))}</span>
              <span className="num hide-md">{diff ? <span className="badge">{pct(diff.pct)}</span> : <span style={{color: 'var(--subtle)'}}>—</span>}</span>
              <span className="hide-sm">
                <Status value={statusDe(l)} />
              </span>
              {excluir && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  className="btn-icone"
                  aria-label={`Excluir lote ${l.lote}`}
                  title="Excluir lote"
                  onClick={e => {
                    e.stopPropagation();
                    openDialog({tipo: 'excluirLote', lote: l.lote});
                  }}
                />
              )}
            </div>
          );
        })}
        {!list.length && <div className="empty">Nenhum lote encontrado.</div>}
        {list.length > limit && (
          <div style={{display: 'flex', justifyContent: 'center', marginTop: 16}}>
            <Button variant="secondary" label={`Mostrar mais (${list.length - limit})`} onClick={() => setLimit(n => n + PAGE)} />
          </div>
        )}
      </section>
    </main>
  );
}
