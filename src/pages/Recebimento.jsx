import {useRef, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {
  COMPRAS, EMBALAGENS, GALPOES, TIPOS, date, divergencia, kg, materialDe, nextLote, pct, pesado, title, today
} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {RotaEditor} from '../ui/RotaEditor.jsx';
import {materiaisConfigurados, sugerirRota} from '../state/rotas.js';
import {pode} from '../state/perfis.js';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';

const EMPTY = {
  cliente: '',
  nf: '',
  material: '',
  compra: 'PRODUTO',
  tipo: 'MOIDO',
  embalagem: 'BIG BAG',
  cor: '',
  pesoNF: '',
  rotaId: '',
  galpao: 'GALPÃO 01',
  molhado: false,
  obs: ''
};

function Seg({options, value, onChange}) {
  return (
    <div className="seg">
      {options.map(o => (
        <button
          key={o}
          type="button"
          className={`seg-btn ${value === o ? 'on' : ''}`}
          onClick={() => onChange(o)}
        >
          {title(o)}
        </button>
      ))}
    </div>
  );
}

const parseKg = text => {
  const n = Number(String(text).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

// The logistics shift at a glance.
function ResumoDoDia({lotes}) {
  const hoje = lotes.filter(l => l.data === today() && !l.origem);
  const divergentes = hoje.filter(l => Math.abs(divergencia(l)?.pct ?? 0) > 0.03).length;
  const cells = [
    {label: 'Lotes recebidos hoje', value: hoje.length},
    {label: 'Peso recebido hoje', value: kg(hoje.reduce((s, l) => s + pesado(l), 0))},
    {label: 'Volumes pesados', value: hoje.reduce((s, l) => s + l.bags.length, 0)},
    {label: 'Divergência acima de 3%', value: divergentes, color: divergentes ? 'var(--ready)' : undefined}
  ];
  return (
    <section className="kpi-strip" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'}}>
      {cells.map(c => (
        <div key={c.label} className="kpi-cell" style={{'--c': c.color}}>
          <span>{c.label}</span>
          <b style={c.color ? {color: c.color} : null}>{c.value}</b>
        </div>
      ))}
    </section>
  );
}

export function Recebimento({onGo}) {
  const {lotes, receive, notify, abrirLote, ativos, cadastros, perfil} = useStore();
  // The logistics operator weighs and opens the lot; the route stays with the PCP.
  const defineRota = pode(perfil, 'editarRota');
  const verFicha = pode(perfil, 'verFicha');
  const [form, setForm] = useState(EMPTY);
  const [bags, setBags] = useState([]);
  const [peso, setPeso] = useState('');
  const [tried, setTried] = useState(false);
  // The route follows the material until someone picks or edits one by hand.
  const [etapas, setEtapas] = useState(null);
  const rotas = cadastros.rotas.filter(r => r.ativo);
  const sugerida = sugerirRota(form.material, rotas);
  const escolhida = form.rotaId ? rotas.find(r => r.id === form.rotaId) : sugerida;
  const rota = etapas ?? escolhida?.etapas ?? [];
  const scale = useRef(null);
  const numero = nextLote(lotes);
  const set = key => value => setForm(f => ({...f, [key]: value}));

  const clientes = ativos('clientes');
  const materiais = ativos('materiais');
  // Logistics can't invent a material: only what the PCP already linked to a route.
  const configurados = materiaisConfigurados(cadastros);

  const total = bags.reduce((s, b) => s + b, 0);
  const nf = parseKg(form.pesoNF);
  const diff = nf && total ? (total - nf) / nf : null;
  const missing = [!form.cliente && 'cliente', !form.material && 'material', !bags.length && 'pesagens', defineRota && !rota.length && 'rota'].filter(Boolean);

  const addBag = () => {
    const value = parseKg(peso);
    if (!value) return;
    setBags(b => [...b, value]);
    setPeso('');
    scale.current?.focus();
  };

  const submit = () => {
    setTried(true);
    if (missing.length) return;
    const cliente = form.cliente.trim().toUpperCase();
    const material = form.material.trim().toUpperCase();
    const lote = {
      lote: numero,
      data: today(),
      cliente,
      materiais: [material],
      nf: Number(form.nf) || null,
      compra: form.compra,
      tipo: form.tipo,
      embalagem: form.embalagem,
      conferente: perfil.nome.toUpperCase(),
      bags,
      pesoNF: nf,
      molhado: form.molhado,
      obs: form.obs,
      status: null,
      cor: form.cor || null,
      novo: true,
      rota,
      rotaLog: [],
      galpao: form.galpao
    };
    receive(lote);
    notify({
      status: defineRota ? 'Lote criado · aguardando início' : 'Lote criado · enviado ao PCP',
      title: `Lote ${numero} · ${title(cliente)}`,
      detail: `${bags.length} ${bags.length === 1 ? "volume" : "volumes"} · ${kg(total)} → ${rota.length ? title(rota[0]) : 'aguardando rota do PCP'}`,
      art: {seed: numero, material, tipo: form.tipo}
    });
    setForm(EMPTY);
    setBags([]);
    setEtapas(null);
    setTried(false);
  };

  const recentes = [...lotes].sort((a, b) => b.data.localeCompare(a.data) || b.lote.localeCompare(a.lote)).slice(0, 8);

  return (
    <main className="page">
      <div>
        <h1 className="page-title">{defineRota ? 'Recebimento' : 'Recebimento de lote'}</h1>
        <p className="page-sub">Nota fiscal, pesagem volume a volume e abertura do lote para o PCP.</p>
      </div>
      {!defineRota && <ResumoDoDia lotes={lotes} />}
      <section className="grid-2">
        <div className="panel">
          <p className="label">Nota fiscal e aviso de recebimento</p>
          <div className="fields">
            <label className="field wide">
              <span>Cliente</span>
              <input
                className="input"
                list="clientes"
                value={form.cliente}
                onChange={e => set('cliente')(e.target.value)}
                placeholder="Ex.: Industria Fox"
                style={tried && !form.cliente ? {borderColor: 'var(--stop)'} : null}
              />
              <datalist id="clientes">
                {clientes.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Número da NF</span>
              <input className="input" inputMode="numeric" value={form.nf} onChange={e => set('nf')(e.target.value)} placeholder="Sem NF" />
            </label>
            <label className="field">
              <span>Peso da NF (kg)</span>
              <input className="input" inputMode="numeric" value={form.pesoNF} onChange={e => set('pesoNF')(e.target.value)} placeholder="0" />
            </label>
            <label className="field wide">
              <span>Material</span>
              {defineRota ? (
                <>
                  <input
                    className="input"
                    list="materiais"
                    value={form.material}
                    onChange={e => set('material')(e.target.value)}
                    placeholder="Ex.: Sucata de plástico"
                    style={tried && !form.material ? {borderColor: 'var(--stop)'} : null}
                  />
                  <datalist id="materiais">
                    {materiais.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              ) : (
                <select
                  className="input"
                  value={form.material}
                  onChange={e => set('material')(e.target.value)}
                  style={tried && !form.material ? {borderColor: 'var(--stop)'} : null}
                >
                  <option value="">{configurados.length ? 'Selecione o material' : 'Nenhum material configurado'}</option>
                  {configurados.map(m => (
                    <option key={m} value={m}>
                      {title(m)}
                    </option>
                  ))}
                </select>
              )}
              {!defineRota && !configurados.length && <small style={{color: 'var(--stop)'}}>Peça ao PCP para ligar os materiais às rotas.</small>}
            </label>
            <div className="field wide">
              <span>Tipo de compra</span>
              <Seg options={COMPRAS} value={form.compra} onChange={set('compra')} />
            </div>
            <div className="field wide">
              <span>Condição</span>
              <Seg options={TIPOS} value={form.tipo} onChange={set('tipo')} />
            </div>
            <div className="field wide">
              <span>Cor</span>
              <Seg options={ativos('cores')} value={form.cor} onChange={v => set('cor')(form.cor === v ? '' : v)} />
            </div>
            <div className="field wide">
              <span>Embalagem</span>
              <Seg options={EMBALAGENS} value={form.embalagem} onChange={set('embalagem')} />
            </div>
            {defineRota ? <div className="field wide">
              <span>Rota de produção</span>
              <select
                className="input"
                value={form.rotaId}
                onChange={e => {
                  set('rotaId')(e.target.value);
                  setEtapas(null);
                }}
                style={tried && !rota.length ? {borderColor: 'var(--stop)'} : null}
              >
                <option value="">{sugerida ? `Rota do material: ${title(sugerida.nome)}` : 'Nenhuma rota ligada: escolha ou monte abaixo'}</option>
                {rotas.map(r => (
                  <option key={r.id} value={r.id}>
                    {title(r.nome)}
                  </option>
                ))}
              </select>
              <RotaEditor etapas={rota} onChange={setEtapas} processos={ativos('processos')} />
              <small style={{color: 'var(--subtle)'}}>
                O operador vai seguir esta sequência. Ajustes aqui valem só para este lote; para mudar o padrão, use Rotas.
              </small>
            </div> : (
              <div className="field wide aviso-pcp">
                <Icon name="flow" size={16} />
                <span>
                  {sugerida
                    ? `Rota do material: ${title(sugerida.nome)} (${sugerida.etapas.map(title).join(' → ')}). O PCP pode ajustar depois.`
                    : 'Selecione o material para ver a rota.'}
                </span>
              </div>
            )}
            <label className="field">
              <span>Local</span>
              <select className="input" value={form.galpao} onChange={e => set('galpao')(e.target.value)}>
                {GALPOES.map(g => (
                  <option key={g} value={g}>{title(g)}</option>
                ))}
              </select>
            </label>
            <label className="check wide">
              <input type="checkbox" checked={form.molhado} onChange={e => set('molhado')(e.target.checked)} />
              Material chegou molhado
            </label>
            <label className="field wide">
              <span>Observações</span>
              <textarea className="input" value={form.obs} onChange={e => set('obs')(e.target.value)} placeholder="Contaminação, paletes, caçamba…" />
            </label>
          </div>
        </div>

        <div className="panel" style={{position: 'sticky', top: 'calc(var(--header) + 16px)'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
            <div className="mat-thumb">
              <MaterialCode material={form.material || 'misto'} tipo={form.tipo} />
            </div>
            <div style={{flex: 1}}>
              <p className="label" style={{margin: 0}}>Pesagem na balança</p>
              <div style={{fontSize: 24, fontWeight: 600, }}>Lote {numero}</div>
            </div>
          </div>
          <div style={{display: 'flex', gap: 8, marginTop: 18}}>
            <div style={{position: 'relative', flex: 1}}>
              <input
                ref={scale}
                className="input scale-input"
                inputMode="numeric"
                placeholder="0"
                value={peso}
                onChange={e => setPeso(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addBag()}
                aria-label="Peso do volume"
              />
              <span className="scale-unit">kg</span>
            </div>
            <Button variant="primary" size="lg" icon="plus" label="Volume" onClick={addBag} style={{height: 76}} />
          </div>
          <div className="bags">
            <AnimatePresence initial={false}>
              {bags.map((b, i) => (
                <motion.span
                  key={`${i}-${b}`}
                  className="bag"
                  layout
                  initial={{opacity: 0, scale: 0.6}}
                  animate={{opacity: 1, scale: 1}}
                  exit={{opacity: 0, scale: 0.6}}
                  transition={{type: 'spring', stiffness: 500, damping: 30}}
                >
                  {b.toLocaleString('pt-BR')}
                  <button type="button" aria-label="Remover" onClick={() => setBags(list => list.filter((_, j) => j !== i))}>
                    <Icon name="x" size={12} stroke={2.5} />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
            {!bags.length && <span style={{color: 'var(--subtle)', fontSize: 14, alignSelf: 'center'}}>Digite o peso e tecle Enter para cada volume.</span>}
          </div>
          <div className="totals">
            <div className="total">
              <span>Pesado ({bags.length})</span>
              <b>{total.toLocaleString('pt-BR')}</b>
            </div>
            <div className="total">
              <span>Nota fiscal</span>
              <b>{nf ? nf.toLocaleString('pt-BR') : '—'}</b>
            </div>
            <div className="total">
              <span>Diferença</span>
              <b style={diff != null && Math.abs(diff) > 0.03 ? {color: 'var(--ready)'} : null}>{pct(diff)}</b>
            </div>
          </div>
          <div className="meter">
            <motion.div
              initial={false}
              animate={{width: `${Math.min(100, nf ? (total / nf) * 100 : total ? 100 : 0)}%`}}
              transition={{type: 'spring', stiffness: 200, damping: 30}}
            />
          </div>
          <div style={{display: 'flex', gap: 8, marginTop: 22, alignItems: 'center', flexWrap: 'wrap'}}>
            <Button variant="primary" size="lg" label={defineRota ? 'Gerar lote e ordem de produção' : 'Gerar lote e enviar ao PCP'} onClick={submit} />
            {tried && missing.length > 0 && (
              <span style={{color: 'var(--stop)', fontSize: 13}}>Falta: {missing.join(', ')}</span>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Últimos recebimentos" onSeeAll={verFicha ? () => onGo('lotes') : null} />
        <div className="rail">
          {recentes.map(l => (
            <button key={l.lote} type="button" className="lot-card" disabled={!verFicha} onClick={() => abrirLote(l.lote)}>
              <div className="lot-top">
                <b>{l.lote}</b>
                <span>{date(l.data)}</span>
              </div>
              <div className="lot-cap">{title(l.cliente)}</div>
              <div className="lot-sub">{kg(pesado(l))}</div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
