import {useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {date, kg, materialDe, pct, title, today} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {parseKg} from '../ui/Dialog.jsx';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';
import {sugerirRota} from '../state/rotas.js';

const EASE_OUT = [0.16, 1, 0.3, 1];
const SHADES = ['var(--fg)', 'var(--subtle)', 'var(--run)', 'var(--stock)', 'var(--ok)', 'var(--ready)'];

function Proporcao({itens}) {
  const total = itens.reduce((s, i) => s + i.peso, 0) || 1;
  return (
    <div className="mix-bar">
      {itens.map((item, i) => (
        <motion.div
          key={item.lote + i}
          initial={{flexGrow: 0}}
          animate={{flexGrow: item.peso / total}}
          transition={{duration: 0.6, ease: EASE_OUT}}
          style={{background: SHADES[i % SHADES.length]}}
          title={`${item.lote}: ${pct(item.peso / total).replace('+', '')}`}
        />
      ))}
    </div>
  );
}

export function Misturas() {
  const {misturas, lotes, balances, misturar, notify, abrirLote, ativos, cadastros} = useStore();
  const [aberta, setAberta] = useState(false);
  const fontes = useMemo(
    () =>
      lotes
        .flatMap(l => {
          const b = balances.get(l.lote);
          return [
            b.est > 0 && {key: `${l.lote}|estoque`, lote: l, de: 'estoque', saldo: b.est},
            b.aberto && !b.porBag && b.pend > 0 && {key: `${l.lote}|pendente`, lote: l, de: 'pendente', saldo: b.pend}
          ];
        })
        .filter(Boolean),
    [lotes, balances]
  );
  const proximo = `MIX-${String(misturas.length + 1).padStart(3, '0')}`;
  const [itens, setItens] = useState([{fonte: '', peso: ''}]);
  const [material, setMaterial] = useState('');
  const [destino, setDestino] = useState('estoque');
  const [obs, setObs] = useState('');
  const [tried, setTried] = useState(false);

  const linhas = itens.map(it => ({...it, src: fontes.find(f => f.key === it.fonte), kg: parseKg(it.peso) ?? 0}));
  const total = linhas.reduce((s, l) => s + l.kg, 0);
  const erros = [
    linhas.filter(l => l.src && l.kg).length < 2 && 'escolha pelo menos dois lotes com peso',
    linhas.some(l => l.src && l.kg > l.src.saldo) && 'peso maior que o saldo do lote',
    !material && 'informe o material resultante'
  ].filter(Boolean);

  const criar = () => {
    setTried(true);
    if (erros.length) return;
    const validos = linhas.filter(l => l.src && l.kg);
    const id = `mix-${Date.now()}`;
    const mat = material.trim().toUpperCase();
    const base = validos[0].src.lote;
    const lote = {
      lote: proximo,
      data: today(),
      cliente: base.cliente,
      materiais: [mat],
      nf: null,
      compra: base.compra,
      tipo: base.tipo,
      embalagem: base.embalagem,
      cor: base.cor,
      conferente: null,
      bags: [],
      pesoEntrada: total,
      pesoNF: null,
      status: null,
      inicial: destino === 'estoque' ? 'estoque' : 'pendente',
      // A mix sent to production follows the route suggested for its material (homogenization by default).
      rota: destino === 'processo' ? sugerirRota(mat, cadastros.rotas)?.etapas ?? ['HOMOGENIZAÇÃO'] : [],
      rotaLog: [],
      galpao: base.galpao ?? 'GALPÃO 01',
      origem: {tipo: 'mistura', mistura: id}
    };
    misturar({
      mistura: {
        id,
        lote: proximo,
        data: today(),
        material: mat,
        destino,
        obs: obs.trim(),
        itens: validos.map(l => ({lote: l.src.lote.lote, peso: l.kg, de: l.src.de}))
      },
      lote
    });
    notify({
      status: 'Mistura criada',
      title: `Lote ${proximo} · ${title(mat)}`,
      detail: `${validos.length} lotes · ${kg(total)} → ${destino === 'estoque' ? 'estoque' : 'produção'}`,
      icon: 'layers',
      art: {seed: proximo, material: mat, tipo: base.tipo}
    });
    setItens([{fonte: '', peso: ''}]);
    setMaterial('');
    setObs('');
    setTried(false);
    setAberta(false);
  };

  return (
    <main className="page" style={{gap: 32}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap'}}>
        <div>
          <h1 className="page-title">Misturas</h1>
          <p className="page-sub">Junte dois ou mais materiais num lote novo, mantendo a origem e a proporção de cada um.</p>
        </div>
        {!aberta && <Button variant="primary" size="lg" icon="plus" label="Nova mistura" onClick={() => setAberta(true)} />}
      </div>

      <AnimatePresence>
        {aberta && (
          <motion.section
            className="panel"
            initial={{opacity: 0, y: -8}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -8, transition: {duration: 0.15}}}
            transition={{duration: 0.3, ease: EASE_OUT}}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <p className="label" style={{margin: 0}}>Nova mistura</p>
                <div style={{fontSize: 24, fontWeight: 600, }}>Lote {proximo}</div>
              </div>
              <Button variant="ghost" label="Cancelar" onClick={() => setAberta(false)} />
            </div>
            <div className="split-rows" style={{marginTop: 18}}>
              {itens.map((it, i) => {
                const src = fontes.find(f => f.key === it.fonte);
                return (
                  <div key={i} className="split-row" style={{gridTemplateColumns: 'minmax(0, 2fr) 140px 40px'}}>
                    <select
                      className="input"
                      value={it.fonte}
                      onChange={e => setItens(list => list.map((x, j) => (j === i ? {...x, fonte: e.target.value, peso: x.peso || String(fontes.find(f => f.key === e.target.value)?.saldo ?? '')} : x)))}
                    >
                      <option value="">Escolha um lote…</option>
                      {fontes.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.lote.lote} · {title(materialDe(f.lote))} · {f.de === 'estoque' ? 'estoque' : 'pendente'} {kg(f.saldo)}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder={src ? `até ${src.saldo}` : 'kg'}
                      value={it.peso}
                      onChange={e => setItens(list => list.map((x, j) => (j === i ? {...x, peso: e.target.value} : x)))}
                    />
                    <Button
                      variant="ghost"
                      className="icon"
                      icon="x"
                      aria-label="Remover"
                      disabled={itens.length === 1}
                      onClick={() => setItens(list => list.filter((_, j) => j !== i))}
                    />
                  </div>
                );
              })}
              <div>
                <Button variant="secondary" size="sm" icon="plus" label="Adicionar lote" onClick={() => setItens(list => [...list, {fonte: '', peso: ''}])} />
              </div>
            </div>
            {total > 0 && (
              <div style={{marginTop: 18}}>
                <Proporcao itens={linhas.filter(l => l.src && l.kg).map(l => ({lote: l.src.lote.lote, peso: l.kg}))} />
                <div className="mix-legend">
                  {linhas
                    .filter(l => l.src && l.kg)
                    .map((l, i) => (
                      <span key={i}>
                        <i style={{background: SHADES[i % SHADES.length]}} />
                        {l.src.lote.lote} · {pct(l.kg / total).replace('+', '')}
                      </span>
                    ))}
                  <b>{kg(total)}</b>
                </div>
              </div>
            )}
            <div className="fields" style={{marginTop: 18}}>
              <label className="field">
                <span>Material resultante</span>
                <input className="input" list="mix-mat" value={material} onChange={e => setMaterial(e.target.value)} placeholder="Ex.: PP preto" />
                <datalist id="mix-mat">
                  {ativos('materiais').map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <div className="field">
                <span>O lote novo vai para</span>
                <div className="seg">
                  {[
                    ['estoque', 'Estoque'],
                    ['processo', 'Produção']
                  ].map(([v, label]) => (
                    <button key={v} type="button" className={`seg-btn ${destino === v ? 'on' : ''}`} onClick={() => setDestino(v)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field wide">
                <span>Observação</span>
                <input className="input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Motivo da mistura, cor alvo…" />
              </label>
            </div>
            <div style={{display: 'flex', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap'}}>
              <Button variant="primary" size="lg" icon="layers" label="Criar mistura" onClick={criar} />
              {tried && erros.length > 0 && <span style={{color: 'var(--stop)', fontSize: 13}}>Falta: {erros.join(', ')}.</span>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section>
        <SectionHeader title="Misturas registradas" />
        <div className="mix-grid">
          {[...misturas].reverse().map(m => {
            const total = m.itens.reduce((s, i) => s + i.peso, 0);
            return (
              <button key={m.id} type="button" className="mix-card" onClick={() => abrirLote(m.lote)}>
                <div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
                  <span className="chart-thumb">
                    <MaterialCode material={m.material} />
                  </span>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{fontSize: 20, fontWeight: 600, }}>Lote {m.lote}</div>
                    <div style={{color: 'var(--muted)', fontSize: 14}}>
                      {title(m.material)} · {date(m.data)} {m.exemplo && <span className="tag">exemplo</span>}
                    </div>
                  </div>
                  <b style={{fontSize: 18}}>{kg(total)}</b>
                </div>
                <div style={{marginTop: 14}}>
                  <Proporcao itens={m.itens} />
                  <div className="mix-legend">
                    {m.itens.map((item, i) => (
                      <span key={item.lote}>
                        <i style={{background: SHADES[i % SHADES.length]}} />
                        {item.lote} · {kg(item.peso)}
                      </span>
                    ))}
                  </div>
                </div>
                {m.obs && <p className="trail-note" style={{marginBottom: 0}}>{m.obs}</p>}
              </button>
            );
          })}
          {!misturas.length && <div className="empty">Nenhuma mistura registrada.</div>}
        </div>
      </section>
    </main>
  );
}
