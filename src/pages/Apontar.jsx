import {useEffect, useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {hours, kg, materialDe, pct, slug, title} from '../state/data.js';
import {horasLiquidas, obtidoDe, pausado, quebraDe} from '../state/balance.js';
import {Button} from '../ui/Button.jsx';
import {parseKg} from '../ui/Dialog.jsx';
import {Icon} from '../ui/Icon.jsx';
import {MaterialCode} from '../ui/MaterialCode.jsx';
import {RotaProgresso} from '../ui/RotaEditor.jsx';
import {Status} from '../ui/Status.jsx';
import {pode} from '../state/perfis.js';
import {Corpo, EASE_OUT, Passos, Rodape} from '../ui/Wizard.jsx';
import {AdicionarBags, BagsDoProcesso, FinalizarBags, IniciarBags} from './ProducaoBags.jsx';

// Under three minutes a kg/h figure is noise, not productivity.
const MIN_HORAS = 0.05;
const MOTIVOS = [
  {grupo: 'Problema', itens: ['MANUTENÇÃO', 'FALTA DE MATERIAL', 'FALTA DE ENERGIA', 'OUTRO']},
  {grupo: 'Parada programada', itens: ['LIMPEZA', 'TROCA DE TURNO', 'REFEIÇÃO']}
];

const n = text => parseKg(text) ?? 0;
const localDate = iso => new Date(iso).toLocaleDateString('sv-SE');
const localTime = iso => new Date(iso).toTimeString().slice(0, 5);
const relogio = h => {
  const s = Math.floor(h * 3600);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => String(v).padStart(2, '0')).join(':');
};

function useNow(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

const PARTES = {
  apontar: {titulo: 'Iniciar processo', sub: 'Escolha a máquina e os bags que vão entrar. Cada bag segue a rota do seu material.'},
  andamento: {titulo: 'Em andamento', sub: 'O que está na máquina agora. Finalize quando o material sair ou registre uma parada.'},
  lancamentos: {titulo: 'Meus lançamentos', sub: 'Os processos que você finalizou hoje.'}
};

export function Apontar({initial, parte, onGo}) {
  const {abertos, balances, maquina = '', setMaquina} = useStore();
  const [finalizando, setFinalizando] = useState(null);
  const cargas = useMemo(() => {
    const mapa = new Map();
    const soma = setor => mapa.set(setor, (mapa.get(setor) ?? 0) + 1);
    abertos.forEach(p => soma(p.setor));
    for (const b of balances.values()) {
      // Bag lots can wait at one machine while other bags run in another.
      if (b.aberto && (b.porBag || !b.processo)) b.steps.forEach(s => s.setor && s.pend > 0 && soma(s.setor));
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [abertos, balances]);
  // Stopped machines come first: they are the ones waiting for someone.
  const naMaquina = abertos.filter(p => !maquina || p.setor === maquina).sort((a, b) => pausado(b) - pausado(a));
  const aberto = abertos.find(p => p.id === finalizando);
  return (
    <main className="page" style={{gap: 20}}>
      <div>
        <h1 className="page-title">{PARTES[parte].titulo}</h1>
        <p className="page-sub">{PARTES[parte].sub}</p>
      </div>
      {parte !== 'lancamentos' && (
        <section className="maq-escolha">
          <p className="label">Minha máquina</p>
          <div className="seg">
            <button type="button" className={`seg-btn ${maquina ? '' : 'on'}`} onClick={() => setMaquina('')}>
              Todas
            </button>
            {cargas.map(([setor, qtd]) => (
              <button key={setor} type="button" className={`seg-btn ${maquina === setor ? 'on' : ''}`} onClick={() => setMaquina(setor)}>
                {title(setor)} <span className="seg-n">{qtd}</span>
              </button>
            ))}
            {maquina && !cargas.some(([setor]) => setor === maquina) && (
              <button type="button" className="seg-btn on">
                {title(maquina)} <span className="seg-n">0</span>
              </button>
            )}
          </div>
        </section>
      )}
      {/* The start form stays mounted so a half-filled lot survives a look at the other screens. */}
      <div hidden={parte !== 'apontar'} className="iniciar-area">
        <IniciarBags key={maquina} maquina={maquina} inicial={initial?.lote} onIniciado={() => onGo('andamento')} />
        <IniciarLegado maquina={maquina} inicial={initial?.lote} onIniciado={() => onGo('andamento')} />
      </div>
      {parte === 'andamento' &&
        (aberto ? (
          aberto.bags ? (
            <FinalizarBags key={aberto.id} proc={aberto} onClose={() => setFinalizando(null)} />
          ) : (
            <FinalizarWizard key={aberto.id} proc={aberto} onClose={() => setFinalizando(null)} />
          )
        ) : naMaquina.length ? (
          <section className="running">
            {naMaquina.map(p => (
              <ProcessoCard key={p.id} proc={p} onFinalizar={() => setFinalizando(p.id)} />
            ))}
          </section>
        ) : (
          <section className="panel op-vazio">
            {maquina ? `Nenhum processo em andamento em ${title(maquina)}.` : 'Nenhum processo em andamento.'}
            <Button variant="primary" size="lg" icon="play" label="Iniciar processo" onClick={() => onGo('apontar')} />
          </section>
        ))}
      {parte === 'lancamentos' && <MeusLancamentos />}
    </main>
  );
}

/* ---------- Running process ---------- */

function ProcessoCard({proc, onFinalizar}) {
  const {loteDe, retomar, cancelar, notify} = useStore();
  const t = useNow();
  const lote = loteDe(proc.lote);
  const parado = pausado(proc);
  const pausa = proc.pausas.find(p => !p.fim);
  const [parando, setParando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const lotesDoProc = proc.bags ? [...new Set(proc.bags.map(e => e.lote))] : [proc.lote];
  const total = lote?.rota?.length ?? 0;
  const terminadas = proc.pausas.filter(p => p.fim);
  const jaParou = terminadas.reduce((s, p) => s + (Date.parse(p.fim) - Date.parse(p.inicio)), 0) / 3600000;
  return (
    <div className={`run-card ${parado ? 'paused' : ''}`}>
      {parado && (
        <div className="parada-faixa">
          <div>
            <span className="parada-rotulo">
              <Icon name="alert" size={16} /> Máquina parada
            </span>
            <b>{title(pausa.motivo)}</b>
            {pausa.obs && <span className="parada-obs">{pausa.obs}</span>}
            <small>desde {localTime(pausa.inicio)}</small>
          </div>
          <div className="parada-tempo">
            <small>Tempo parado</small>
            <b>{relogio((t - Date.parse(pausa.inicio)) / 3600000)}</b>
          </div>
        </div>
      )}
      <div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
        <span className="pick-thumb">{lote && <MaterialCode material={materialDe(lote)} tipo={lote.tipo} />}</span>
        <div style={{flex: 1, minWidth: 0}}>
          <div className="pick-title">
            {proc.bags ? `${title(proc.setor)} · ${proc.bags.length} ${proc.bags.length === 1 ? 'bag' : 'bags'}` : `Lote ${proc.lote}`}
          </div>
          <div className="pick-sub">
            {proc.bags ? (
              lotesDoProc.map(l => `Lote ${l}`).join(', ')
            ) : (
              <>
                Etapa {proc.etapa + 1}
                {total ? ` de ${total}` : ''} · {title(proc.setor)}
              </>
            )}
          </div>
          <div className="pick-meta">
            {!parado && <Status value="EM PROCESSO" short />}
            <span>
              {title(proc.operador)} · desde {localTime(proc.inicio)}
            </span>
          </div>
        </div>
        <div className="run-clock">
          <b>{relogio(horasLiquidas(proc, t))}</b>
          <small>{parado ? 'tempo rodando' : `${kg(proc.usado)} na máquina`}</small>
        </div>
      </div>
      {proc.bags && <BagsDoProcesso proc={proc} podeMexer={!parado} />}
      {terminadas.length > 0 && (
        <div className="parada-historico">
          {terminadas.length} {terminadas.length === 1 ? 'parada anterior' : 'paradas anteriores'} · {relogio(jaParou)} ·{' '}
          {[...new Set(terminadas.map(p => title(p.motivo)))].join(', ')}
        </div>
      )}
      <div className="run-actions">
        {parado ? (
          <Button
            variant="primary"
            size="lg"
            icon="play"
            label="Retomar produção"
            onClick={() => {
              retomar(proc.id);
              notify({status: 'Produção retomada', title: `Lote ${proc.lote} · ${title(proc.setor)}`, detail: `Parada de ${relogio((Date.now() - Date.parse(pausa.inicio)) / 3600000)}`, icon: 'play'});
            }}
          />
        ) : (
          <>
            <Button variant="primary" size="lg" icon="check" label="Finalizar" onClick={onFinalizar} />
            {proc.bags && <Button variant="secondary" size="lg" icon="plus" label="Adicionar bag" onClick={() => setAdicionando(true)} />}
            <Button variant="danger" size="lg" icon="pause" label="Parar máquina" onClick={() => setParando(true)} />
          </>
        )}
        <span className="run-espaco" />
        {confirmando ? (
          <>
            <span className="run-confirma">{kg(proc.usado)} voltam para a fila. Cancelar?</span>
            <Button
              variant="outline"
              label="Sim, cancelar"
              onClick={() => {
                cancelar(proc.id);
                notify({status: 'Início cancelado', title: proc.bags ? `${title(proc.setor)} · ${proc.bags.length} bags` : `Lote ${proc.lote}`, detail: `${kg(proc.usado)} voltaram para a fila`, icon: 'refresh'});
              }}
            />
            <Button variant="ghost" label="Não" onClick={() => setConfirmando(false)} />
          </>
        ) : (
          <Button variant="ghost" label="Iniciei errado" onClick={() => setConfirmando(true)} />
        )}
      </div>
      {parado && <p className="parada-dica">Para finalizar, retome a produção primeiro.</p>}
      {parando && <PararMaquina proc={proc} onClose={() => setParando(false)} />}
      {adicionando && <AdicionarBags proc={proc} onClose={() => setAdicionando(false)} />}
    </div>
  );
}

function PararMaquina({proc, onClose}) {
  const {pausar, notify} = useStore();
  const [motivo, setMotivo] = useState(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState(null);
  useEffect(() => {
    const key = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const confirmar = () => {
    if (!motivo) return setErro('Escolha o motivo da parada.');
    if (motivo === 'OUTRO' && !obs.trim()) return setErro('Em "Outro", descreva o que aconteceu.');
    pausar(proc.id, motivo, obs.trim());
    notify({status: 'Máquina parada', title: `Lote ${proc.lote} · ${title(proc.setor)}`, detail: title(motivo), icon: 'pause'});
    onClose();
  };
  return (
    <>
      <div className="sheet-veil" style={{zIndex: 70}} onClick={onClose} />
      <div className="dialog parada-dialogo" role="dialog" aria-modal="true" aria-label="Parar máquina">
        <div className="section-head">
          <div>
            <h2 className="wiz-q" style={{margin: 0}}>Por que {title(proc.setor)} vai parar?</h2>
            <p className="page-sub">Lote {proc.lote} · {kg(proc.usado)} na máquina. O tempo de produção para de contar.</p>
          </div>
        </div>
        {MOTIVOS.map(g => (
          <div key={g.grupo} className="parada-grupo">
            <p className="label">{g.grupo}</p>
            <div className="parada-motivos">
              {g.itens.map(m => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={motivo === m}
                  className={`parada-motivo ${motivo === m ? 'on' : ''}`}
                  onClick={() => {
                    setMotivo(m);
                    setErro(null);
                  }}
                >
                  {title(m)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <label className="field">
          <span>Observação{motivo === 'OUTRO' ? '' : ' (opcional)'}</span>
          <input className="input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: bomba da lavadora, aguardando peça" />
        </label>
        <div className="wiz-foot" style={{marginTop: 16}}>
          <Button variant="secondary" size="lg" label="Voltar" onClick={onClose} />
          <div style={{display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
            {erro && <span className="wiz-err">{erro}</span>}
            <Button variant="danger-solido" size="lg" icon="pause" label="Confirmar parada" onClick={confirmar} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- The operator's own records ---------- */

function MeusLancamentos() {
  const {apontamentos, perfil} = useStore();
  const hoje = localDate(new Date().toISOString());
  const nome = perfil.nome.toUpperCase();
  const lista = apontamentos.filter(a => a.data === hoje && a.operador === nome).reverse();
  return (
    <section>
      <div className="dtable-wrap">
        {lista.length ? (
          <table className="dtable sem-hover">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Máquina</th>
                <th>Horário</th>
                <th className="n">Entrou</th>
                <th className="n">Saiu</th>
                <th className="n">Quebra</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(a => (
                <tr key={a.id}>
                  <td className="lote">{a.lote}</td>
                  <td>{title(a.setor)}</td>
                  <td>{a.inicio ? `${a.inicio} às ${a.fim}` : '—'}</td>
                  <td className="n">{kg(a.usado)}</td>
                  <td className="n">{kg(obtidoDe(a))}</td>
                  <td className="n">{kg(quebraDe(a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">Nenhum processo finalizado por você hoje.</div>
        )}
      </div>
    </section>
  );
}

/* ---------- Start a process ---------- */

const PASSOS_INICIO = ['Lote', 'Máquina', 'Quantidade', 'Conferir'];

// Lots received or started before production by bag: they finish the old way, by weight.
function IniciarLegado({inicial, maquina, onIniciado}) {
  const {lotes, balances} = useStore();
  const tem = lotes.some(l => {
    const b = balances.get(l.lote);
    return b?.aberto && !b.porBag && b.pend > 0 && !b.processo && (!maquina || b.steps.some(s => s.setor === maquina && s.pend > 0));
  });
  if (!tem) return null;
  return (
    <div className="legado-area">
      <p className="label">Lotes do modelo antigo, por peso</p>
      <p className="page-sub" style={{fontSize: 13, marginBottom: 10}}>Lotes que já tinham produção lançada antes dos bags terminam do jeito antigo.</p>
      <IniciarWizard key={maquina} inicial={inicial} maquina={maquina} onIniciado={onIniciado} />
    </div>
  );
}

function IniciarWizard({inicial, maquina, onIniciado}) {
  const {lotes, balances, perfil, iniciar, notify, ativos, statusDe, abrirLote} = useStore();
  const disponiveis = useMemo(
    () =>
      lotes
        .filter(l => {
          const b = balances.get(l.lote);
          return b?.aberto && !b.porBag && b.pend > 0 && !b.processo && (!maquina || b.steps.some(s => s.setor === maquina && s.pend > 0));
        })
        .sort((a, b) => b.data.localeCompare(a.data)),
    [lotes, balances, maquina]
  );
  const ocupados = useMemo(() => lotes.filter(l => !balances.get(l.lote)?.porBag && balances.get(l.lote)?.processo), [lotes, balances]);
  const [passo, setPasso] = useState(0);
  const [sel, setSel] = useState(null);
  const [etapa, setEtapa] = useState(null);
  const [usado, setUsado] = useState('');
  const [operador, setOperador] = useState(perfil.tipo === 'producao' ? perfil.nome.toUpperCase() : '');
  const [erro, setErro] = useState(null);
  const lote = disponiveis.find(l => l.lote === sel);
  const b = lote ? balances.get(lote.lote) : null;
  const candidatas = b ? b.steps.map((s, i) => ({...s, i})).filter(s => s.pend > 0 && (!maquina || s.setor === maquina)) : [];

  function escolher(id) {
    const lb = balances.get(id);
    setSel(id);
    setErro(null);
    if (!lb.rota.length) return;
    const first = lb.steps.findIndex(s => s.pend > 0 && (!maquina || s.setor === maquina));
    setEtapa(first);
    setUsado(String(lb.steps[first].pend));
    setPasso(1);
  }

  // Coming from a lot's "Apontar" button: that lot is already chosen.
  useEffect(() => {
    if (inicial && disponiveis.some(l => l.lote === inicial)) escolher(inicial);
  }, []);

  const avancar = () => {
    if (passo === 1 && etapa == null) return setErro('Escolha a etapa.');
    if (passo === 2) {
      const q = n(usado);
      if (!q) return setErro('Informe quanto vai entrar na máquina.');
      if (q > b.steps[etapa].pend) return setErro(`Só há ${kg(b.steps[etapa].pend)} aguardando esta etapa.`);
      if (!operador.trim()) return setErro('Informe o operador.');
    }
    setErro(null);
    setPasso(p => p + 1);
  };

  const comecar = () => {
    const setor = b.rota[etapa];
    iniciar({id: `pr-${Date.now()}`, lote: lote.lote, etapa, setor, usado: n(usado), operador: operador.trim().toUpperCase()});
    notify({
      status: `Processo iniciado às ${new Date().toTimeString().slice(0, 5)}`,
      title: `Lote ${lote.lote} · ${title(setor)}`,
      detail: `${kg(n(usado))} na máquina · ${title(operador)}`,
      icon: 'play',
      art: {seed: lote.lote, material: materialDe(lote), tipo: lote.tipo}
    });
    setPasso(0);
    setSel(null);
    setEtapa(null);
    onIniciado();
  };

  return (
    <section className="panel wiz">
      <div className="wiz-head">
        <h2 className="section-title">Iniciar processo</h2>
        <Passos passos={PASSOS_INICIO} atual={passo} />
      </div>

      {passo === 0 && (
        <Corpo passo={0}>
          <p className="wiz-q">Qual lote vai entrar na máquina?</p>
          <div className="pick-grid">
            {disponiveis.map(l => {
              const lb = balances.get(l.lote);
              const semRota = !lb.rota.length;
              // Weight per machine: the lot's total would read as if it all sat at one machine.
              const filas = lb.steps.filter(s => s.setor && s.pend > 0 && (!maquina || s.setor === maquina));
              const naFila = semRota ? lb.pend : filas.reduce((soma, s) => soma + s.pend, 0);
              return (
                <button
                  key={l.lote}
                  type="button"
                  className={`pick ${sel === l.lote ? 'on' : ''} ${semRota ? 'blocked' : ''}`}
                  onClick={() => (semRota ? setSel(l.lote) : escolher(l.lote))}
                >
                  <span className="pick-thumb">
                    <MaterialCode material={materialDe(l)} tipo={l.tipo} />
                  </span>
                  <span style={{minWidth: 0, flex: 1}}>
                    <span className="pick-title">{l.lote}</span>
                    <span className="pick-sub">
                      {title(materialDe(l))} · {title(l.cliente)}
                    </span>
                    <span className="pick-meta pick-filas">
                      {semRota ? (
                        <span style={{color: 'var(--ready)'}}>Sem rota definida</span>
                      ) : (
                        filas.map((s, i) => (
                          <span key={i} className="pick-fila">
                            {title(s.setor)} <b>{kg(s.pend)}</b>
                          </span>
                        ))
                      )}
                    </span>
                  </span>
                  <span className="pick-kg">
                    <small>{filas.length > 1 ? 'Total aguardando' : 'Aguardando'}</small>
                    {kg(naFila)}
                  </span>
                </button>
              );
            })}
          </div>
          {!disponiveis.length && (
            <div className="empty">{maquina ? `Nenhum lote aguardando ${title(maquina)} agora.` : 'Nenhum lote com material aguardando.'}</div>
          )}
          {lote && !b.rota.length && (
            <div className="wiz-alert">
              <Icon name="alert" size={16} />
              <span>
                O lote {lote.lote} não tem rota de máquinas.{' '}
                {pode(perfil, 'editarRota') ? (
                  <button type="button" className="trail-link" onClick={() => abrirLote(lote.lote)}>
                    Definir rota do lote
                  </button>
                ) : (
                  'Avise o PCP para definir a rota.'
                )}
              </span>
            </div>
          )}
          {ocupados.length > 0 && (
            <p className="wiz-note">
              {ocupados.map(l => l.lote).join(', ')} {ocupados.length === 1 ? 'está' : 'estão'} em máquina agora e{' '}
              {ocupados.length === 1 ? 'volta' : 'voltam'} para esta lista depois de finalizar.
            </p>
          )}
        </Corpo>
      )}

      {passo === 1 && b && (
        <Corpo passo={1}>
          <p className="wiz-q">
            Lote {lote.lote}: {candidatas.length > 1 ? 'qual etapa?' : 'próxima máquina da rota'}
          </p>
          <RotaProgresso b={b} />
          <div className="machine-grid">
            {candidatas.map(c => (
              <button
                key={c.i}
                type="button"
                className={`machine ${etapa === c.i ? 'on' : ''}`}
                onClick={() => {
                  setEtapa(c.i);
                  setUsado(String(c.pend));
                }}
              >
                <span className="machine-step">
                  Etapa {c.i + 1} de {b.rota.length}
                </span>
                <span className="machine-name">{title(c.setor)}</span>
                <span className="machine-kg">{kg(c.pend)} aguardando</span>
                {etapa === c.i && (
                  <span className="machine-check">
                    <Icon name="check" size={16} stroke={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="wiz-note">
            <Icon name="alert" size={13} /> A ordem das máquinas segue a rota do lote. Só o PCP ou o gerente pode mudar a rota.
          </p>
        </Corpo>
      )}

      {passo === 2 && b && (
        <Corpo passo={2}>
          <p className="wiz-q">Quanto vai entrar na {title(b.rota[etapa])}?</p>
          <div style={{position: 'relative', maxWidth: 420}}>
            <input className="input scale-input" inputMode="numeric" value={usado} onChange={e => setUsado(e.target.value)} autoFocus />
            <span className="scale-unit">kg</span>
          </div>
          <p className="wiz-note">
            Aguardando nesta etapa: <b>{kg(b.steps[etapa].pend)}</b>. Se usar só uma parte, o resto continua na fila.
          </p>
          <label className="field" style={{maxWidth: 420, marginTop: 16}}>
            <span>Operador</span>
            {perfil.tipo === 'producao' ? (
              <input className="input" value={title(operador)} readOnly aria-readonly="true" />
            ) : (
              <select className="input" value={operador} onChange={e => setOperador(e.target.value)}>
                <option value="">Selecione</option>
                {[...new Set([...ativos('operadores'), perfil.nome.toUpperCase()])].map(o => (
                  <option key={o} value={o}>
                    {title(o)}
                  </option>
                ))}
              </select>
            )}
          </label>
        </Corpo>
      )}

      {passo === 3 && b && (
        <Corpo passo={3}>
          <p className="wiz-q">Confira antes de iniciar</p>
          <div className="review">
            <div>
              <span>Lote</span>
              <b>{lote.lote}</b>
              <small>
                {title(materialDe(lote))} · <Status value={statusDe(lote)} short />
              </small>
            </div>
            <div>
              <span>Máquina</span>
              <b>{title(b.rota[etapa])}</b>
              <small>
                Etapa {etapa + 1} de {b.rota.length}
              </small>
            </div>
            <div>
              <span>Entra na máquina</span>
              <b>{kg(n(usado))}</b>
              <small>fica na fila: {kg(b.steps[etapa].pend - n(usado))}</small>
            </div>
            <div>
              <span>Operador · início</span>
              <b>{title(operador)}</b>
              <small>agora, {new Date().toTimeString().slice(0, 5)}</small>
            </div>
          </div>
        </Corpo>
      )}

      <Rodape
        passo={passo}
        erro={erro}
        onVoltar={() => {
          setErro(null);
          setPasso(p => p - 1);
        }}
        onAvancar={passo === 0 ? null : passo === 3 ? comecar : avancar}
        avancarLabel={passo === 3 ? 'Iniciar agora' : 'Avançar'}
        final={passo === 3}
      />
    </section>
  );
}

/* ---------- Finish a process ---------- */

const PASSOS_FIM = ['Saída', 'Perdas', 'Conferir'];

function FinalizarWizard({proc, onClose}) {
  const {loteDe, ativos, finalizar, notify, lotes} = useStore();
  const lote = loteDe(proc.lote);
  const rota = lote.rota ?? [];
  const proxima = proc.etapa < rota.length - 1 ? rota[proc.etapa + 1] : null;
  const [passo, setPasso] = useState(0);
  const [separa, setSepara] = useState(false);
  const [obtido, setObtido] = useState('');
  const [itens, setItens] = useState([{material: '', peso: '', destino: 'estoque'}]);
  // Loss kinds come from the office's list; the operator fills in kilos, never new kinds.
  const tiposPerda = ativos('tiposPerda');
  const [perdas, setPerdas] = useState({});
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState(null);
  // What didn't become a child lot: moves on in this lot, returns to this machine's queue, or is a loss.
  const [resto, setResto] = useState(null);
  const [restoKg, setRestoKg] = useState('');
  const agora = Date.now();

  const nosFilhos = itens.reduce((s, it) => s + n(it.peso), 0);
  const sobra = separa ? Math.max(0, proc.usado - nosFilhos) : 0;
  const continua = sobra > 0 && (resto === 'proxima' || resto === 'maquina') ? n(restoKg) || sobra : 0;
  const volta = resto === 'maquina' ? continua : 0;
  const segueNoLote = resto === 'proxima' ? continua : 0;
  // Material back in the queue was not processed, so it doesn't count as having gone through the machine.
  const processado = proc.usado - volta;
  const saiu = separa ? nosFilhos + segueNoLote : n(obtido);
  const quebra = Math.max(0, processado - saiu);
  const destinoLote = proxima ? title(proxima) : 'o estoque';
  const somaPerdas = tiposPerda.reduce((s, t) => s + n(perdas[t]), 0);
  const tempo = horasLiquidas(proc, agora);
  const setItem = (i, key, v) => setItens(list => list.map((it, j) => (j === i ? {...it, [key]: v} : it)));

  const avancar = () => {
    if (passo === 0) {
      if (separa && itens.some(it => !it.material.trim() || !n(it.peso))) return setErro('Complete material e peso de cada separação.');
      if (!saiu) return setErro('Informe quanto saiu de material bom.');
      if ((separa ? nosFilhos : saiu) > proc.usado) return setErro(`Saiu mais do que entrou (${kg(proc.usado)}).`);
      if (sobra > 0 && !resto) return setErro(`Diga o que aconteceu com os ${kg(sobra)} que não foram para os lotes filhos.`);
      if (continua > sobra) return setErro(`Só sobraram ${kg(sobra)} fora dos lotes filhos.`);
    }
    if (passo === 1 && somaPerdas > quebra) return setErro(`As perdas somam ${kg(somaPerdas)}, mas a quebra foi de ${kg(quebra)}.`);
    setErro(null);
    // Everything that entered came out: there is no loss to classify.
    setPasso(p => (p === 0 && !quebra ? 2 : p + 1));
  };

  const confirmar = () => {
    const id = `ap-${Date.now()}`;
    const used = new Set(lotes.map(l => l.lote));
    const filhos = [];
    const restante = rota.slice(proc.etapa + 1);
    const separacao = separa
      ? itens.map(it => {
          const material = it.material.trim().toUpperCase();
          let code = `${lote.lote}-${slug(material)}`;
          for (let k = 2; used.has(code); k++) code = `${lote.lote}-${slug(material)}${k}`;
          used.add(code);
          const segue = it.destino === 'rota' && restante.length > 0;
          filhos.push({
            lote: code,
            data: localDate(proc.inicio),
            cliente: lote.cliente,
            materiais: [material],
            nf: null,
            compra: lote.compra,
            tipo: lote.tipo,
            embalagem: lote.embalagem,
            cor: lote.cor,
            conferente: proc.operador,
            bags: [],
            pesoEntrada: n(it.peso),
            pesoNF: null,
            status: null,
            inicial: segue ? 'pendente' : 'estoque',
            rota: segue ? restante : [],
            rotaLog: [],
            galpao: lote.galpao,
            origem: {tipo: 'separacao', pai: lote.lote, apontamento: id}
          });
          return {material, peso: n(it.peso), lote: code, destino: segue ? 'rota' : 'estoque'};
        })
      : undefined;
    finalizar({
      id: proc.id,
      filhos,
      ap: {
        id,
        lote: lote.lote,
        etapa: proc.etapa,
        setor: proc.setor,
        data: localDate(proc.inicio),
        inicio: localTime(proc.inicio),
        fim: new Date().toTimeString().slice(0, 5),
        horas: tempo,
        pausas: proc.pausas.map(p => ({...p, fim: p.fim ?? new Date().toISOString()})),
        usado: processado,
        obtido: separa ? undefined : saiu,
        separacao,
        ...(segueNoLote ? {continua: {peso: segueNoLote}} : {}),
        ...(volta ? {voltouParaFila: volta} : {}),
        // Numbers typed before correcting the output to "all of it" no longer apply.
        perdas: quebra ? Object.fromEntries(tiposPerda.filter(t => n(perdas[t]) > 0).map(t => [t, n(perdas[t])])) : {},
        operador: proc.operador,
        obs: obs.trim()
      }
    });
    notify({
      status: `Etapa ${proc.etapa + 1} finalizada · rendimento ${pct(saiu / processado).replace('+', '')}`,
      title: `Lote ${lote.lote} · ${title(proc.setor)}`,
      detail: filhos.length
        ? [
            `Separado em ${filhos.length} ${filhos.length === 1 ? 'lote' : 'lotes'}: ${filhos.map(f => f.lote).join(', ')}`,
            segueNoLote && `${kg(segueNoLote)} seguem para ${destinoLote}`,
            volta && `${kg(volta)} voltaram para a fila`
          ].filter(Boolean).join(' · ')
        : proxima
          ? `${kg(saiu)} seguem para ${title(proxima)}`
          : `${kg(saiu)} foram para o estoque`,
      icon: 'check',
      art: {seed: lote.lote, material: materialDe(lote), tipo: lote.tipo}
    });
    onClose();
  };

  return (
    <motion.section
      className="panel wiz finishing"
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.3, ease: EASE_OUT}}
    >
      <div className="wiz-head">
        <div>
          <h2 className="section-title">
            Finalizar · Lote {lote.lote} · {title(proc.setor)}
          </h2>
          <p className="page-sub" style={{fontSize: 14}}>
            Entraram {kg(proc.usado)} às {localTime(proc.inicio)} · {title(proc.operador)}
          </p>
        </div>
        <Passos passos={quebra ? PASSOS_FIM : PASSOS_FIM.filter(p => p !== 'Perdas')} atual={!quebra && passo === 2 ? 1 : passo} />
      </div>

      {passo === 0 && (
        <Corpo passo={0}>
          <p className="wiz-q">Quanto saiu de material bom?</p>
          <label className="toggle" style={{marginBottom: 16}}>
            <input type="checkbox" checked={separa} onChange={e => setSepara(e.target.checked)} />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            A máquina separou o material em vários tipos
          </label>
          {separa ? (
            <div className="split-rows" style={{marginTop: 0}}>
              {itens.map((it, i) => (
                <div key={i} className="split-row">
                  <input
                    className="input"
                    list="mat-sep"
                    placeholder="Material (ex.: PP natural)"
                    value={it.material}
                    onChange={e => setItem(i, 'material', e.target.value)}
                  />
                  <input className="input" inputMode="numeric" placeholder="kg" value={it.peso} onChange={e => setItem(i, 'peso', e.target.value)} />
                  <select className="input" value={it.destino} onChange={e => setItem(i, 'destino', e.target.value)}>
                    <option value="estoque">Vai para o estoque</option>
                    {proxima && <option value="rota">Segue para {title(proxima)}</option>}
                  </select>
                  <Button
                    variant="ghost"
                    className="icon"
                    icon="x"
                    aria-label="Remover"
                    disabled={itens.length === 1}
                    onClick={() => setItens(list => list.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
              <datalist id="mat-sep">
                {ativos('materiais').map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="plus"
                  label="Adicionar material"
                  onClick={() => setItens(list => [...list, {material: '', peso: '', destino: 'estoque'}])}
                />
              </div>
              <p className="wiz-note">Cada material vira um lote filho, ligado a este na trilha.</p>
              {nosFilhos > 0 && sobra > 0 && (
                <div className="resto">
                  <p className="resto-titulo">
                    Sobraram <b>{kg(sobra)}</b> que não foram para os lotes filhos. O que aconteceu com eles?
                  </p>
                  <div className="resto-opcoes">
                    {[
                      {id: 'proxima', titulo: proxima ? `Seguem para ${title(proxima)}` : 'Vão para o estoque', sub: `Continuam no lote ${lote.lote}`},
                      {id: 'maquina', titulo: `Voltam para a fila de ${title(proc.setor)}`, sub: 'Ainda vão passar por esta máquina'},
                      {id: 'perda', titulo: 'É perda', sub: tiposPerda.length ? tiposPerda.slice(0, 3).map(t => title(t)).join(', ') + (tiposPerda.length > 3 ? '…' : '') : 'Classifique no próximo passo'}
                    ].map(o => (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={resto === o.id}
                        className={`resto-opcao ${resto === o.id ? 'on' : ''}`}
                        onClick={() => {
                          setResto(o.id);
                          setRestoKg('');
                          setErro(null);
                        }}
                      >
                        <b>{o.titulo}</b>
                        <small>{o.sub}</small>
                      </button>
                    ))}
                  </div>
                  {(resto === 'proxima' || resto === 'maquina') && (
                    <label className="field resto-kg">
                      <span>Quanto continua (kg)</span>
                      <input className="input" inputMode="numeric" value={restoKg} onChange={e => setRestoKg(e.target.value)} placeholder={String(sobra)} />
                      <small>Em branco, continua tudo. O que faltar para {kg(sobra)} conta como perda.</small>
                    </label>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{position: 'relative', maxWidth: 420}}>
                <input className="input scale-input" inputMode="numeric" value={obtido} onChange={e => setObtido(e.target.value)} placeholder="0" autoFocus />
                <span className="scale-unit">kg</span>
              </div>
              <p className="wiz-note">
                Entraram <b>{kg(proc.usado)}</b>. O material bom{' '}
                {proxima ? (
                  <>
                    segue para <b>{title(proxima)}</b>
                  </>
                ) : (
                  <>
                    vai para o <b>estoque</b>
                  </>
                )}
                .
              </p>
            </>
          )}
          {saiu > 0 && !quebra && (
            <p className="wiz-note sem-perda">
              <Icon name="check" size={15} stroke={2.6} /> Todo o material foi destinado. Não há perdas para informar.
            </p>
          )}
        </Corpo>
      )}

      {passo === 1 && (
        <Corpo passo={1}>
          <p className="wiz-q">Do que se perdeu ({kg(quebra)}), quanto foi:</p>
          <div className="fields perdas-campos">
            {tiposPerda.map(t => (
              <label key={t} className="field">
                <span>{title(t)} (kg)</span>
                <input
                  className="input big-input"
                  inputMode="numeric"
                  value={perdas[t] ?? ''}
                  onChange={e => setPerdas(p => ({...p, [t]: e.target.value}))}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
          {!tiposPerda.length && <p className="wiz-note">Nenhum tipo de perda cadastrado. A perda fica sem categoria; peça ao gerente para cadastrar os tipos.</p>}
          <div className="meter" style={{maxWidth: 720}}>
            <motion.div
              initial={false}
              animate={{width: `${quebra ? Math.min(100, (somaPerdas / quebra) * 100) : 0}%`}}
              style={{background: somaPerdas > quebra ? 'var(--stop)' : 'var(--fg)'}}
            />
          </div>
          <p className="wiz-note">
            Classificado: {kg(somaPerdas)} de {kg(quebra)}
            {quebra > somaPerdas ? ` · ${kg(quebra - somaPerdas)} ficam sem categoria` : ''}
          </p>
        </Corpo>
      )}

      {passo === 2 && (
        <Corpo passo={2}>
          <p className="wiz-q">Confira antes de finalizar</p>
          <div className="review">
            <div>
              <span>Entrou</span>
              <b>{kg(proc.usado)}</b>
              {volta > 0 && <small>{kg(volta)} voltam para a fila de {title(proc.setor)}</small>}
            </div>
            <div>
              <span>{separa ? 'Lotes filhos' : 'Saiu'}</span>
              <b>{kg(separa ? nosFilhos : saiu)}</b>
              <small>{separa ? `${itens.length} ${itens.length === 1 ? 'material separado' : 'materiais separados'}` : proxima ? `→ ${title(proxima)}` : '→ estoque'}</small>
            </div>
            {segueNoLote > 0 && (
              <div>
                <span>Continua no lote</span>
                <b>{kg(segueNoLote)}</b>
                <small>→ {destinoLote}</small>
              </div>
            )}
            <div>
              <span>Quebra</span>
              <b style={quebra ? {color: 'var(--stop)'} : null}>{kg(quebra)}</b>
              <small>{pct(quebra / processado).replace('+', '')}</small>
            </div>
            <div>
              <span>Rendimento</span>
              <b style={{color: 'var(--run)'}}>{pct(saiu / processado).replace('+', '')}</b>
            </div>
            <div>
              <span>Tempo trabalhado</span>
              <b>{hours(tempo)}</b>
              <small>
                {localTime(proc.inicio)} até agora
                {proc.pausas.length ? ` · ${proc.pausas.length} ${proc.pausas.length === 1 ? 'parada' : 'paradas'}` : ''}
              </small>
            </div>
            <div>
              <span>Produtividade</span>
              <b>{tempo >= MIN_HORAS ? `${Math.round(saiu / tempo).toLocaleString('pt-BR')} kg/h` : '—'}</b>
            </div>
          </div>
          <label className="field" style={{marginTop: 16}}>
            <span>Observação (opcional)</span>
            <input className="input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Algo diferente neste processo?" />
          </label>
        </Corpo>
      )}

      <Rodape
        passo={passo}
        erro={erro}
        onVoltar={() => {
          setErro(null);
          setPasso(p => (p === 2 && !quebra ? 0 : p - 1));
        }}
        onAvancar={passo === 2 ? confirmar : avancar}
        avancarLabel={passo === 2 ? 'Confirmar e finalizar' : 'Avançar'}
        final={passo === 2}
      />
      <div style={{textAlign: 'right', marginTop: 8}}>
        <Button variant="ghost" size="sm" label="Fechar sem finalizar" onClick={onClose} />
      </div>
    </motion.section>
  );
}
