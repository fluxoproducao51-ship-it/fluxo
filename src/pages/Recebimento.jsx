import {useRef, useState} from 'react';
import {motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {
  COMPRAS, EMBALAGENS, GALPOES, TIPOS, date, divergencia, kg, materialDe, nextLote, nomeVolume, pct, pesado, title, today
} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {RotaEditor} from '../ui/RotaEditor.jsx';
import {materiaisConfigurados, sugerirRota} from '../state/rotas.js';
import {pode} from '../state/perfis.js';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';
import {BagsDoLote} from '../ui/BagsDoLote.jsx';

const EMPTY = {
  numero: '',
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

// Whole bags of a received lot going back to the customer, without leaving the receiving screen.
function DevolucaoDeBags({lotes}) {
  const {devolucoes} = useStore();
  const recebidos = lotes
    .filter(l => !l.origem && l.bags.length > 0)
    .sort((a, b) => b.data.localeCompare(a.data) || b.lote.localeCompare(a.lote));
  const [escolhido, setEscolhido] = useState('');
  const lote = recebidos.find(l => l.lote === escolhido);
  return (
    <section className="panel">
      <h2 className="section-title">Devolução de {nomeVolume('BIG BAG', 2).toLowerCase()}</h2>
      <p className="page-sub" style={{fontSize: 14}}>
        Só dá para devolver antes de o lote entrar em produção.
      </p>
      <label className="field" style={{maxWidth: 520, marginTop: 12}}>
        <span>Lote</span>
        <select className="input" value={escolhido} onChange={e => setEscolhido(e.target.value)}>
          <option value="">{recebidos.length ? 'Selecione o lote' : 'Nenhum lote recebido'}</option>
          {recebidos.map(l => {
            const dev = devolucoes.filter(d => d.lote === l.lote).length;
            return (
              <option key={l.lote} value={l.lote}>
                {l.lote} · {title(l.cliente)} · {l.bags.length} {nomeVolume(l.embalagem, l.bags.length).toLowerCase()} · {date(l.data)}
                {dev ? ` · ${dev} devolvido${dev === 1 ? '' : 's'}` : ''}
              </option>
            );
          })}
        </select>
      </label>
      {lote && (
        <div style={{marginTop: 14}}>
          <BagsDoLote lote={lote} />
        </div>
      )}
    </section>
  );
}

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
  // One line per volume that arrived, each with its own weight from the scale.
  const [pesos, setPesos] = useState(['']);
  const [tried, setTried] = useState(false);
  // The route follows the material until someone picks or edits one by hand.
  const [etapas, setEtapas] = useState(null);
  const rotas = cadastros.rotas.filter(r => r.ativo);
  const sugerida = sugerirRota(form.material, rotas);
  const escolhida = form.rotaId ? rotas.find(r => r.id === form.rotaId) : sugerida;
  const rota = etapas ?? escolhida?.etapas ?? [];
  const campos = useRef([]);
  // The number on the paperwork can be typed in; left blank, the next one in sequence is used.
  const sugerido = nextLote(lotes);
  const digitado = form.numero.trim().toUpperCase();
  const numero = digitado || sugerido;
  const numeroRepetido = digitado && lotes.some(l => l.lote.toUpperCase() === digitado);
  const set = key => value => setForm(f => ({...f, [key]: value}));

  const clientes = [...ativos('clientes')].sort();
  const materiais = ativos('materiais');
  // Logistics can't invent a material: only what the PCP already linked to a route.
  const configurados = materiaisConfigurados(cadastros);

  const bags = pesos.map(parseKg);
  const semPeso = bags.map((b, i) => (b ? null : i + 1)).filter(Boolean);
  const pesados = bags.filter(Boolean);
  const total = pesados.reduce((s, b) => s + b, 0);
  const volume = nomeVolume(form.embalagem);
  const nf = parseKg(form.pesoNF);
  const diff = nf && total ? (total - nf) / nf : null;
  const missing = [!form.cliente && 'cliente', !form.material && 'material', !pesos.length && 'pesagens', semPeso.length > 0 && `peso ${semPeso.length === 1 ? 'do' : 'dos'} ${nomeVolume(form.embalagem, semPeso.length).toLowerCase()} ${semPeso.join(', ')}`, defineRota && !rota.length && 'rota', numeroRepetido && 'número do lote (já existe)'].filter(Boolean);

  const focar = i => setTimeout(() => campos.current[i]?.focus(), 0);
  const mudarQuantidade = texto => {
    const n = Math.min(200, Math.max(0, Number(texto.replace(/\D/g, '')) || 0));
    setPesos(lista => (n > lista.length ? [...lista, ...Array(n - lista.length).fill('')] : lista.slice(0, n)));
  };
  const mudarPeso = (i, valor) => setPesos(lista => lista.map((p, j) => (j === i ? valor : p)));
  const adicionarVolume = () => {
    setPesos(lista => [...lista, '']);
    focar(pesos.length);
  };
  const removerVolume = i => setPesos(lista => lista.filter((_, j) => j !== i));
  // Enter jumps to the next volume; on the last one it just leaves the field.
  const proximo = i => {
    const alvo = i < pesos.length - 1 ? campos.current[i + 1] : null;
    if (alvo) {
      alvo.focus();
      alvo.select();
    } else campos.current[i]?.blur();
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
      bags: pesados,
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
      detail: `${pesados.length} ${nomeVolume(form.embalagem, pesados.length).toLowerCase()} · ${kg(total)} → ${rota.length ? title(rota[0]) : 'aguardando rota do PCP'}`,
      art: {seed: numero, material, tipo: form.tipo}
    });
    setForm(EMPTY);
    setPesos(['']);
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
              <span>Número do lote</span>
              <input
                className="input"
                value={form.numero}
                onChange={e => set('numero')(e.target.value.toUpperCase().replace(/[^A-Z0-9\-./]/g, ''))}
                maxLength={20}
                placeholder={`Automático: ${sugerido}`}
                aria-invalid={Boolean(numeroRepetido)}
                style={numeroRepetido ? {borderColor: 'var(--stop)'} : null}
              />
              <small style={{color: numeroRepetido ? 'var(--stop)' : 'var(--subtle)'}}>
                {numeroRepetido ? `Já existe um lote ${digitado}. Use outro número.` : 'Deixe em branco para usar o próximo número da sequência.'}
              </small>
            </label>
            <label className="field wide">
              <span>Cliente</span>
              <select
                className="input"
                value={form.cliente}
                onChange={e => set('cliente')(e.target.value)}
                style={tried && !form.cliente ? {borderColor: 'var(--stop)'} : null}
              >
                <option value="">{clientes.length ? 'Selecione o cliente' : 'Nenhum cliente cadastrado'}</option>
                {clientes.map(c => (
                  <option key={c} value={c}>
                    {title(c)}
                  </option>
                ))}
              </select>
              {!clientes.length && <small style={{color: 'var(--stop)'}}>Peça ao gerente para cadastrar os clientes.</small>}
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
          <div className="volumes-topo">
            <label className="field">
              <span>Quantidade de {nomeVolume(form.embalagem, 2).toLowerCase()}</span>
              <input
                className="input volumes-qtd"
                inputMode="numeric"
                value={pesos.length || ''}
                onChange={e => mudarQuantidade(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="0"
              />
            </label>
            <small>Informe quantos chegaram e lance o peso de cada um. Enter passa para o próximo.</small>
          </div>
          <ol className="volumes">
            {pesos.map((p, i) => (
              <li key={i} className={tried && !parseKg(p) ? 'sem-peso' : ''}>
                <span className="volume-nome">
                  {volume} {i + 1}
                </span>
                <div className="volume-peso">
                  <input
                    ref={el => (campos.current[i] = el)}
                    className="input"
                    inputMode="numeric"
                    value={p}
                    onChange={e => mudarPeso(i, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && proximo(i)}
                    placeholder="0"
                    aria-label={`Peso do ${volume.toLowerCase()} ${i + 1}`}
                  />
                  <span className="scale-unit">kg</span>
                </div>
                <button type="button" className="volume-x" aria-label={`Remover ${volume.toLowerCase()} ${i + 1}`} onClick={() => removerVolume(i)}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            ))}
          </ol>
          <Button icon="plus" label={`Adicionar ${volume.toLowerCase()}`} onClick={adicionarVolume} />
          <div className="totals">
            <div className="total">
              <span>Pesado ({pesados.length} de {pesos.length})</span>
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

      {pode(perfil, 'devolver') && <DevolucaoDeBags lotes={lotes} />}

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
              <div className="lot-sub">
                {l.bags.length > 0 && `${l.bags.length} ${nomeVolume(l.embalagem, l.bags.length).toLowerCase()} · `}
                {kg(pesado(l))}
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
