import {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {kg, materialDe, materialDoBag, nomeVolume, title, today} from '../state/data.js';
import {podeDevolverBag} from '../state/balance.js';
import {HistoricoDoBag} from './HistoricoDoBag.jsx';
import {Button} from './Button.jsx';
import {MaterialCode} from './MaterialCode.jsx';
import {oQueSaiComLote} from '../state/excluir.js';

const EASE_OUT = [0.16, 1, 0.3, 1];

export const parseKg = text => {
  const n = Number(String(text).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function Dialogs() {
  const {dialog, closeDialog} = useStore();
  useEffect(() => {
    if (!dialog) return undefined;
    const key = event => event.key === 'Escape' && closeDialog();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [dialog]);
  return (
    <AnimatePresence>
      {dialog && (
        <>
          <motion.div
            key="veil"
            className="sheet-veil"
            style={{zIndex: 70}}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onClick={closeDialog}
          />
          <motion.div
            key="dialog"
            className="dialog"
            initial={{opacity: 0, y: 16, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: 8, transition: {duration: 0.15, ease: 'easeIn'}}}
            transition={{duration: 0.3, ease: EASE_OUT}}
          >
            {dialog.tipo === 'envio' && <Envio lote={dialog.lote} cliente={dialog.cliente} pesoSugerido={dialog.peso} />}
            {dialog.tipo === 'excluirLote' && <ExcluirLote lote={dialog.lote} />}
            {dialog.tipo === 'devolucao' && <Devolucao lote={dialog.lote} bag={dialog.bag} />}
            {dialog.tipo === 'bag' && (
              <>
                <HistoricoDoBag lote={dialog.lote} i={dialog.bag} />
                <div style={{marginTop: 16, textAlign: 'right'}}>
                  <Button variant="secondary" label="Fechar" onClick={closeDialog} />
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Envio({lote: id, cliente, pesoSugerido}) {
  const {loteDe, balancoDe, ordemDe, enviar, notify, closeDialog, ativos} = useStore();
  const lote = loteDe(id);
  const saldo = balancoDe(id)?.est ?? 0;
  const [form, setForm] = useState({
    cliente: cliente ?? lote?.cliente ?? '',
    peso: String(pesoSugerido && pesoSugerido < saldo ? pesoSugerido : saldo),
    nf: '',
    responsavel: '',
    data: today()
  });
  const [tried, setTried] = useState(false);
  const set = key => e => setForm(f => ({...f, [key]: e.target.value}));
  const peso = parseKg(form.peso);
  const erro = !peso ? 'Informe o peso.' : peso > saldo ? `Saldo disponível: ${kg(saldo)}.` : !form.cliente ? 'Informe o cliente.' : null;
  const submit = () => {
    setTried(true);
    if (erro) return;
    const b = balancoDe(id);
    const fechar = peso === saldo && !b.pend;
    enviar({
      envio: {
        id: `env-${Date.now()}`,
        lote: id,
        data: form.data,
        cliente: form.cliente.trim().toUpperCase(),
        nf: form.nf.trim() || null,
        responsavel: form.responsavel.trim().toUpperCase() || null,
        peso
      },
      fechar: fechar && Boolean(ordemDe(id))
    });
    notify({
      status: fechar ? 'Lote entregue' : 'Envio registrado',
      title: `Lote ${id} → ${title(form.cliente)}`,
      detail: `${kg(peso)}${fechar ? '' : ` · saldo ${kg(saldo - peso)}`}`,
      icon: 'truck',
      art: {seed: id, material: materialDe(lote), tipo: lote.tipo}
    });
    closeDialog();
  };
  return (
    <>
      <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
        <div className="mat-thumb">
          <MaterialCode material={materialDe(lote)} tipo={lote.tipo} />
        </div>
        <div>
          <p className="label" style={{margin: 0}}>Envio ao cliente</p>
          <div style={{fontSize: 24, fontWeight: 600, }}>Lote {id}</div>
          <div style={{color: 'var(--muted)', fontSize: 14}}>
            {title(materialDe(lote))} · em estoque {kg(saldo)}
          </div>
        </div>
      </div>
      <div className="fields" style={{marginTop: 22}}>
        <label className="field wide">
          <span>Cliente</span>
          <input className="input" list="envio-clientes" value={form.cliente} onChange={set('cliente')} />
          <datalist id="envio-clientes">
            {ativos('clientes').map(c => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Peso enviado (kg)</span>
          <input className="input" inputMode="numeric" value={form.peso} onChange={set('peso')} />
        </label>
        <label className="field">
          <span>Data</span>
          <input className="input" type="date" value={form.data} onChange={set('data')} />
        </label>
        <label className="field">
          <span>Nota fiscal de saída</span>
          <input className="input" value={form.nf} onChange={set('nf')} placeholder="Opcional" />
        </label>
        <label className="field">
          <span>Responsável</span>
          <input className="input" value={form.responsavel} onChange={set('responsavel')} placeholder="Opcional" />
        </label>
      </div>
      <div style={{display: 'flex', gap: 8, marginTop: 22, alignItems: 'center', flexWrap: 'wrap'}}>
        <Button variant="primary" size="lg" icon="truck" label="Registrar envio" onClick={submit} />
        <Button variant="ghost" label="Cancelar" onClick={closeDialog} />
        {tried && erro && <span style={{color: 'var(--stop)', fontSize: 13}}>{erro}</span>}
      </div>
    </>
  );
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function ExcluirLote({lote: id}) {
  const store = useStore();
  const {loteDe, balancoDe, excluirLote, notify, closeDialog} = store;
  const lote = loteDe(id);
  if (!lote) return null;
  const fora = oQueSaiComLote(id, store);
  const outros = [...fora.lotes].filter(l => l !== id);
  const junto = [
    outros.length && plural(outros.length, 'lote derivado', 'lotes derivados') + ` (${outros.join(', ')})`,
    fora.apontamentos && plural(fora.apontamentos, 'apontamento de produção', 'apontamentos de produção'),
    fora.abertos && plural(fora.abertos, 'processo em andamento', 'processos em andamento'),
    fora.misturas.size && plural(fora.misturas.size, 'mistura', 'misturas'),
    fora.envios && plural(fora.envios, 'envio a cliente', 'envios a clientes'),
    fora.ordens && plural(fora.ordens, 'ordem de produção', 'ordens de produção'),
    fora.devolucoes && plural(fora.devolucoes, 'devolução de big bag', 'devoluções de big bag')
  ].filter(Boolean);
  const est = balancoDe(id)?.est ?? 0;
  const confirmar = () => {
    excluirLote(id);
    notify({status: 'Lote excluído', title: `Lote ${id}`, detail: outros.length ? `e ${plural(outros.length, 'lote derivado', 'lotes derivados')}` : title(lote.cliente), icon: 'trash'});
    closeDialog();
  };
  return (
    <>
      <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
        <div className="mat-thumb">
          <MaterialCode material={materialDe(lote)} tipo={lote.tipo} />
        </div>
        <div>
          <p className="label" style={{margin: 0}}>Excluir lote</p>
          <div style={{fontSize: 24, fontWeight: 600}}>Lote {id}</div>
          <div style={{color: 'var(--muted)', fontSize: 14}}>
            {title(materialDe(lote))} · {title(lote.cliente)}
            {est > 0 ? ` · ${kg(est)} em estoque` : ''}
          </div>
        </div>
      </div>
      <div className="excluir-aviso">
        <b>Esta ação não pode ser desfeita.</b>
        {junto.length ? (
          <>
            <span>Também serão excluídos:</span>
            <ul>
              {junto.map(j => (
                <li key={j}>{j}</li>
              ))}
            </ul>
          </>
        ) : (
          <span>O lote não tem apontamentos, envios nem lotes derivados.</span>
        )}
      </div>
      <div style={{display: 'flex', gap: 8, marginTop: 22, alignItems: 'center', flexWrap: 'wrap'}}>
        <Button variant="danger-solido" size="lg" icon="trash" label="Excluir lote" onClick={confirmar} />
        <Button variant="ghost" label="Cancelar" onClick={closeDialog} />
      </div>
    </>
  );
}

// Sending whole bags back to the customer. Several bags of the same lot usually go on one invoice.
function Devolucao({lote: id, bag}) {
  const {loteDe, balancoDe, devolucoes, devolver, ativos, notify, closeDialog, perfil} = useStore();
  const lote = loteDe(id);
  const b = balancoDe(id);
  const devolvidos = new Set(devolucoes.filter(d => d.lote === id).map(d => d.bag));
  const disponiveis = (lote?.bags ?? []).map((peso, i) => ({i, peso})).filter(x => !devolvidos.has(x.i) && podeDevolverBag(lote, b, x.peso, x.i));
  const [marcados, setMarcados] = useState(() => new Set(disponiveis.some(x => x.i === bag) ? [bag] : []));
  const [form, setForm] = useState({motivo: '', nf: '', data: today(), obs: ''});
  const [tried, setTried] = useState(false);
  if (!lote) return null;
  const motivos = ativos('motivosDevolucao');
  const nome = nomeVolume(lote.embalagem);
  const nomes = n => nomeVolume(lote.embalagem, n).toLowerCase();
  const set = key => e => setForm(f => ({...f, [key]: e.target.value}));
  const escolhidos = disponiveis.filter(x => marcados.has(x.i));
  const peso = escolhidos.reduce((s, x) => s + x.peso, 0);
  const erro = !escolhidos.length
    ? `Marque pelo menos um ${nome.toLowerCase()}.`
    : !b.porBag && peso > b.steps[0].pend
      ? `Só ${kg(b.steps[0].pend)} ainda não entraram em produção.`
      : !form.motivo
        ? 'Escolha o motivo da devolução.'
        : null;
  const alternar = i => setMarcados(m => {
    const n = new Set(m);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });
  const confirmar = () => {
    setTried(true);
    if (erro) return;
    const agora = Date.now();
    devolver(
      escolhidos.map((x, k) => ({
        id: `dev-${agora}-${k}`,
        lote: id,
        bag: x.i,
        peso: x.peso,
        motivo: form.motivo,
        nf: form.nf.trim() || null,
        data: form.data,
        responsavel: perfil.nome.toUpperCase(),
        obs: form.obs.trim() || null,
        // Shown on screen right away; the database stamps its own time on insert.
        criadoEm: new Date(agora).toISOString()
      }))
    );
    notify({
      status: 'Devolução registrada',
      title: `Lote ${id} · ${escolhidos.length} ${nomes(escolhidos.length)}`,
      detail: `${kg(peso)} devolvidos · ${title(form.motivo)}`,
      icon: 'truck'
    });
    closeDialog();
  };
  return (
    <>
      <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
        <div className="mat-thumb">
          <MaterialCode material={materialDe(lote)} tipo={lote.tipo} />
        </div>
        <div>
          <p className="label" style={{margin: 0}}>Devolução ao cliente</p>
          <div style={{fontSize: 24, fontWeight: 600}}>Lote {id}</div>
          <div style={{color: 'var(--muted)', fontSize: 14}}>
            {title(materialDe(lote))} · {title(lote.cliente)}
          </div>
        </div>
      </div>
      <p className="label" style={{marginTop: 20}}>Quais {nomes(2)} voltam</p>
      <div className="devolver-bags">
        {disponiveis.map(x => (
          <label key={x.i} className={`devolver-bag ${marcados.has(x.i) ? 'on' : ''}`}>
            <input type="checkbox" checked={marcados.has(x.i)} onChange={() => alternar(x.i)} />
            <span>
              {nome} {x.i + 1}
            </span>
            <b>{kg(x.peso)}</b>
            <small>{title(materialDoBag(lote, x.i))}</small>
          </label>
        ))}
      </div>
      <div className="fields" style={{marginTop: 16}}>
        <label className="field wide">
          <span>Motivo</span>
          <select className="input" value={form.motivo} onChange={set('motivo')} style={tried && !form.motivo ? {borderColor: 'var(--stop)'} : null}>
            <option value="">{motivos.length ? 'Selecione o motivo' : 'Nenhum motivo cadastrado'}</option>
            {motivos.map(m => (
              <option key={m} value={m}>
                {title(m)}
              </option>
            ))}
          </select>
          {!motivos.length && <small style={{color: 'var(--stop)'}}>Peça ao gerente para cadastrar os motivos de devolução.</small>}
        </label>
        <label className="field">
          <span>NF de devolução</span>
          <input className="input" value={form.nf} onChange={set('nf')} placeholder="Opcional" />
        </label>
        <label className="field">
          <span>Data</span>
          <input className="input" type="date" value={form.data} onChange={set('data')} />
        </label>
        <label className="field wide">
          <span>Observação</span>
          <input className="input" value={form.obs} onChange={set('obs')} placeholder="Opcional" />
        </label>
      </div>
      <div className="devolver-total">
        Devolvendo <b>{escolhidos.length} {nomes(escolhidos.length)}</b> · <b>{kg(peso)}</b>
      </div>
      <div style={{display: 'flex', gap: 8, marginTop: 18, alignItems: 'center', flexWrap: 'wrap'}}>
        <Button variant="primary" size="lg" icon="truck" label="Registrar devolução" onClick={confirmar} />
        <Button variant="ghost" label="Cancelar" onClick={closeDialog} />
        {tried && erro && <span style={{color: 'var(--stop)', fontSize: 13}}>{erro}</span>}
      </div>
    </>
  );
}
