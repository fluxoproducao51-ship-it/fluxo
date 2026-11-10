import {useMemo} from 'react';
import {useStore} from '../state/store.jsx';
import {pode} from '../state/perfis.js';
import {date, kg, materialDe, title, tons} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';

export function Estoque() {
  const {lotes, balances, envios, abrirLote, openDialog, loteDe, perfil} = useStore();
  const excluir = pode(perfil, 'excluirLote');
  const extra = excluir ? ' com-excluir' : '';
  const emEstoque = useMemo(
    () =>
      lotes
        .map(l => ({l, b: balances.get(l.lote)}))
        .filter(({b}) => b.est > 0)
        .sort((x, y) => y.b.est - x.b.est),
    [lotes, balances]
  );
  const total = emEstoque.reduce((s, x) => s + x.b.est, 0);
  const enviado = envios.reduce((s, e) => s + e.peso, 0);
  const historico = [...envios].sort((a, b) => b.data.localeCompare(a.data));
  return (
    <main className="page" style={{gap: 36}}>
      <div>
        <h1 className="page-title">Estoque e envios</h1>
        <p className="page-sub">Produto acabado disponível por lote. Envie o lote inteiro ou só uma parte.</p>
      </div>
      <section className="kpis" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
        <div className="kpi">
          <span>Disponível em estoque</span>
          <b>{tons(total)} t</b>
          <small>{emEstoque.length} lotes</small>
        </div>
        <div className="kpi">
          <span>Já enviado a clientes</span>
          <b>{tons(enviado)} t</b>
          <small>{envios.length} envios</small>
        </div>
        <div className="kpi">
          <span>Maior saldo</span>
          <b>{emEstoque[0] ? emEstoque[0].l.lote : '—'}</b>
          <small>{emEstoque[0] ? `${title(materialDe(emEstoque[0].l))} · ${kg(emEstoque[0].b.est)}` : ''}</small>
        </div>
      </section>

      <section>
        <SectionHeader title="Lotes em estoque" />
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
          {emEstoque.map(({l, b}) => (
            <div key={l.lote} className={`row stock-row${extra}`}>
              <span className="row-thumb">
                <MaterialCode material={materialDe(l)} tipo={l.tipo} />
              </span>
              <button type="button" className="row-link" onClick={() => abrirLote(l.lote)}>
                {l.lote}
              </button>
              <span className="cut">
                {title(materialDe(l))}
                <span style={{color: 'var(--subtle)'}}> · {title(l.cliente)}</span>
              </span>
              <span className="num hide-sm" style={{color: 'var(--muted)'}}>{kg(b.est + b.enviado + (b.misturado || 0))}</span>
              <span className="num hide-md" style={{color: 'var(--muted)'}}>{kg(b.enviado)}</span>
              <span className="num" style={{fontWeight: 600}}>{kg(b.est)}</span>
              <span className="acoes-lote">
                {pode(perfil, 'enviar') && (
                  <Button variant="secondary" size="sm" icon="truck" label="Enviar" onClick={() => openDialog({tipo: 'envio', lote: l.lote})} />
                )}
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
              </span>
            </div>
          ))}
          {!emEstoque.length && <div className="empty">Nada em estoque. Aponte um processo com destino “Estoque”.</div>}
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
          {!historico.length && <div className="empty">Nenhum envio registrado ainda.</div>}
        </div>
      </section>
    </main>
  );
}
