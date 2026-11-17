import {useEffect, useMemo, useState} from 'react';
import {motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {hours, kg, nomeVolume, pct, slug, title} from '../state/data.js';
import {horasLiquidas} from '../state/balance.js';
import {rotaDoBag, tempoNaMaquina} from '../state/bags.js';
import {Button} from '../ui/Button.jsx';
import {parseKg} from '../ui/Dialog.jsx';
import {Icon} from '../ui/Icon.jsx';
import {Corpo, EASE_OUT, Passos, Rodape} from '../ui/Wizard.jsx';

const n = text => parseKg(text) ?? 0;
const localDate = iso => new Date(iso).toLocaleDateString('sv-SE');
const localTime = iso => new Date(iso).toTimeString().slice(0, 5);
const agoraISO = () => new Date().toISOString();

// Bags waiting for a machine, from every bag-model lot.
function useBagsNaFila() {
  const {lotes, balances} = useStore();
  return useMemo(() => {
    const porMaquina = new Map();
    for (const l of lotes) {
      const b = balances.get(l.lote);
      if (!b?.porBag) continue;
      for (const s of b.steps) {
        if (!s.setor) continue;
        for (const bag of s.bags) porMaquina.set(s.setor, [...(porMaquina.get(s.setor) ?? []), {...bag, loteObj: l}]);
      }
    }
    return porMaquina;
  }, [lotes, balances]);
}

const entradaDe = (bag, operador) => ({
  bag: bag.id,
  lote: bag.lote,
  n: bag.n,
  i: bag.i,
  material: bag.material,
  etapa: bag.etapa,
  peso: bag.peso,
  entrada: agoraISO(),
  operador
});

function OperadorCampo({valor, onChange}) {
  const {perfil, ativos} = useStore();
  return (
    <label className="field" style={{maxWidth: 420}}>
      <span>Operador</span>
      {perfil.tipo === 'producao' ? (
        <input className="input" value={title(valor)} readOnly aria-readonly="true" />
      ) : (
        <select className="input" value={valor} onChange={e => onChange(e.target.value)}>
          <option value="">Selecione</option>
          {[...new Set([...ativos('operadores'), perfil.nome.toUpperCase()])].map(o => (
            <option key={o} value={o}>
              {title(o)}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

// The bags waiting for one machine, grouped by lot. Only one material can go in at a time.
function EscolherBags({bags, marcados, onMarcar, material}) {
  const grupos = useMemo(() => {
    const m = new Map();
    for (const bag of bags) m.set(bag.lote, [...(m.get(bag.lote) ?? []), bag]);
    return [...m.entries()];
  }, [bags]);
  return (
    <div className="escolher-bags">
      {grupos.map(([lote, lista]) => {
        const l = lista[0].loteObj;
        const nome = nomeVolume(l.embalagem);
        const livres = lista.filter(x => !material || x.material === material);
        const todos = livres.length > 0 && livres.every(x => marcados.has(x.id));
        return (
          <div key={lote} className="escolher-lote">
            <div className="escolher-lote-topo">
              <b className="mono">Lote {lote}</b>
              <span>
                {title(l.cliente)} · {lista.length} {nomeVolume(l.embalagem, lista.length).toLowerCase()} aguardando
              </span>
              {livres.length > 1 && (
                <button type="button" className="trail-link" onClick={() => onMarcar(livres, !todos)}>
                  {todos ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
            </div>
            <div className="escolher-grade">
              {lista.map(bag => {
                const outro = material && bag.material !== material;
                return (
                  <label key={bag.id} className={`escolher-bag ${marcados.has(bag.id) ? 'on' : ''} ${outro ? 'off' : ''}`} title={outro ? `Material diferente: ${title(bag.material)}` : undefined}>
                    <input type="checkbox" checked={marcados.has(bag.id)} disabled={outro} onChange={() => onMarcar([bag], !marcados.has(bag.id))} />
                    <span>
                      {nome} {bag.n}
                    </span>
                    <b>{kg(bag.peso)}</b>
                    <small>{title(bag.material)}</small>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function useMarcados() {
  const [marcados, setMarcados] = useState(() => new Set());
  const marcar = (lista, sim) =>
    setMarcados(atual => {
      const novo = new Set(atual);
      for (const x of lista) {
        if (sim) novo.add(x.id);
        else novo.delete(x.id);
      }
      return novo;
    });
  return [marcados, marcar, setMarcados];
}

/* ---------- Start a process with bags ---------- */

const PASSOS = ['Máquina', 'Bags', 'Conferir'];

export function IniciarBags({maquina, inicial, onIniciado}) {
  const {perfil, iniciar, notify, balances, lotes} = useStore();
  const naFila = useBagsNaFila();
  const maquinas = [...naFila.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const [passo, setPasso] = useState(maquina ? 1 : 0);
  const [setor, setSetor] = useState(maquina || '');
  const [marcados, marcar, setMarcados] = useMarcados();
  const [operador, setOperador] = useState(perfil.tipo === 'producao' ? perfil.nome.toUpperCase() : '');
  const [erro, setErro] = useState(null);
  const disponiveis = naFila.get(setor) ?? [];
  const escolhidos = disponiveis.filter(x => marcados.has(x.id));
  const material = escolhidos[0]?.material ?? null;
  const total = escolhidos.reduce((s, x) => s + x.peso, 0);
  const semRota = lotes.filter(l => balances.get(l.lote)?.porBag && balances.get(l.lote).steps.some(s => !s.setor && s.bags.length)).map(l => l.lote);

  // Coming from a lot's "Iniciar processo" button: its machine and bags come chosen.
  useEffect(() => {
    if (!inicial) return;
    const alvo = maquinas.find(([, lista]) => lista.some(x => x.lote === inicial));
    if (!alvo) return;
    setSetor(alvo[0]);
    const doLote = alvo[1].filter(x => x.lote === inicial);
    const mat = doLote[0].material;
    marcar(doLote.filter(x => x.material === mat), true);
    setPasso(1);
  }, []);

  const avancar = () => {
    if (passo === 0 && !setor) return setErro('Escolha a máquina.');
    if (passo === 1) {
      if (!escolhidos.length) return setErro('Marque os bags que vão entrar na máquina.');
      if (!operador.trim()) return setErro('Informe o operador.');
    }
    setErro(null);
    setPasso(p => p + 1);
  };

  const comecar = () => {
    const quem = operador.trim().toUpperCase();
    const bags = escolhidos.map(x => entradaDe(x, quem));
    const primeiro = escolhidos[0];
    const rotaLote = balances.get(primeiro.lote).rota;
    iniciar({id: `pr-${Date.now()}`, lote: primeiro.lote, etapa: Math.max(0, rotaLote.indexOf(setor)), setor, usado: total, operador: quem, bags});
    const lotesNoProcesso = [...new Set(bags.map(e => e.lote))];
    notify({
      status: `Processo iniciado às ${localTime(agoraISO())}`,
      title: `${title(setor)} · ${bags.length} ${bags.length === 1 ? 'bag' : 'bags'}`,
      detail: `${kg(total)} · ${lotesNoProcesso.length === 1 ? `lote ${lotesNoProcesso[0]}` : `lotes ${lotesNoProcesso.join(', ')}`} · ${title(quem)}`,
      icon: 'play'
    });
    setMarcados(new Set());
    setPasso(maquina ? 1 : 0);
    if (!maquina) setSetor('');
    onIniciado();
  };

  return (
    <section className="panel wiz">
      <div className="wiz-head">
        <h2 className="section-title">Iniciar processo</h2>
        <Passos passos={PASSOS} atual={passo} />
      </div>

      {passo === 0 && (
        <Corpo passo={0}>
          <p className="wiz-q">Em qual máquina os bags vão entrar?</p>
          <div className="machine-grid">
            {maquinas.map(([m, lista]) => (
              <button
                key={m}
                type="button"
                className={`machine ${setor === m ? 'on' : ''}`}
                onClick={() => {
                  setSetor(m);
                  setMarcados(new Set());
                  setErro(null);
                  setPasso(1);
                }}
              >
                <span className="machine-step">{new Set(lista.map(x => x.lote)).size === 1 ? `Lote ${lista[0].lote}` : `${new Set(lista.map(x => x.lote)).size} lotes`}</span>
                <span className="machine-name">{title(m)}</span>
                <span className="machine-kg">
                  {lista.length} {lista.length === 1 ? 'bag' : 'bags'} · {kg(lista.reduce((s, x) => s + x.peso, 0))}
                </span>
              </button>
            ))}
          </div>
          {!maquinas.length && <div className="empty">Nenhum bag aguardando máquina agora.</div>}
          {semRota.length > 0 && (
            <p className="wiz-note">
              <Icon name="alert" size={13} /> {semRota.length === 1 ? 'O lote' : 'Os lotes'} {semRota.join(', ')} {semRota.length === 1 ? 'ainda não tem' : 'ainda não têm'} rota: avise o PCP.
            </p>
          )}
        </Corpo>
      )}

      {passo === 1 && (
        <Corpo passo={1}>
          <p className="wiz-q">Quais bags vão entrar na {title(setor)}?</p>
          {disponiveis.length ? (
            <EscolherBags bags={disponiveis} marcados={marcados} onMarcar={marcar} material={material} />
          ) : (
            <div className="empty">Nenhum bag aguardando {title(setor)} agora.</div>
          )}
          {material && (
            <p className="wiz-note">
              Entram juntos só bags de <b>{title(material)}</b>. Para outro material, inicie outro processo.
            </p>
          )}
          <div className="bags-escolhidos">
            <b>{escolhidos.length}</b> {escolhidos.length === 1 ? 'bag marcado' : 'bags marcados'} · <b>{kg(total)}</b>
          </div>
          <OperadorCampo valor={operador} onChange={setOperador} />
        </Corpo>
      )}

      {passo === 2 && (
        <Corpo passo={2}>
          <p className="wiz-q">Confira antes de iniciar</p>
          <div className="review">
            <div>
              <span>Máquina</span>
              <b>{title(setor)}</b>
            </div>
            <div>
              <span>Bags</span>
              <b>{escolhidos.length}</b>
              <small>{title(material)}</small>
            </div>
            <div>
              <span>Entra na máquina</span>
              <b>{kg(total)}</b>
              <small>{[...new Set(escolhidos.map(x => x.lote))].map(l => `lote ${l}`).join(', ')}</small>
            </div>
            <div>
              <span>Operador · início</span>
              <b>{title(operador)}</b>
              <small>agora, {localTime(agoraISO())}</small>
            </div>
          </div>
          <div className="bags-lista-curta">
            {escolhidos.map(x => (
              <span key={x.id}>
                Bag {x.n} · lote {x.lote} · {kg(x.peso)}
              </span>
            ))}
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
        onAvancar={passo === 0 ? null : passo === 2 ? comecar : avancar}
        avancarLabel={passo === 2 ? 'Iniciar agora' : 'Avançar'}
        final={passo === 2}
      />
    </section>
  );
}

/* ---------- Bags inside a running process ---------- */

export function BagsDoProcesso({proc, podeMexer}) {
  const {retirarBag, notify} = useStore();
  const [retirando, setRetirando] = useState(null);
  const t = useAgora();
  return (
    <div className="proc-bags">
      <p className="label">
        Bags na máquina · {proc.bags.length} · {kg(proc.usado)}
      </p>
      <div className="proc-bags-lista">
        {[...proc.bags]
          .sort((a, b) => a.entrada.localeCompare(b.entrada))
          .map(e => (
            <div key={e.bag} className="proc-bag">
              <b>
                Bag {e.n} · lote {e.lote}
              </b>
              <span>
                {kg(e.peso)} · {title(e.material)}
              </span>
              <small>
                entrou {localTime(e.entrada)} · {title(e.operador)} · {hours(tempoNaMaquina(e.entrada, null, proc.pausas, t))}
              </small>
              {podeMexer &&
                proc.bags.length > 1 &&
                (retirando === e.bag ? (
                  <span className="bag-acoes">
                    <Button
                      size="sm"
                      variant="primary"
                      label="Sim, retirar"
                      onClick={() => {
                        retirarBag(proc.id, e.bag);
                        setRetirando(null);
                        notify({status: 'Bag retirado da máquina', title: `Bag ${e.n} · lote ${e.lote}`, detail: `${kg(e.peso)} voltaram para a fila de ${title(proc.setor)}`, icon: 'refresh'});
                      }}
                    />
                    <Button size="sm" label="Não" onClick={() => setRetirando(null)} />
                  </span>
                ) : (
                  <button type="button" className="bag-link" onClick={() => setRetirando(e.bag)}>
                    Retirar (entrou por engano)
                  </button>
                ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function useAgora(ms = 30000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

// More bags going into a machine that is already running.
export function AdicionarBags({proc, onClose}) {
  const {adicionarBags, notify, perfil} = useStore();
  const naFila = useBagsNaFila();
  const material = proc.bags[0]?.material ?? null;
  const disponiveis = (naFila.get(proc.setor) ?? []).filter(x => x.material === material);
  const [marcados, marcar] = useMarcados();
  const [operador, setOperador] = useState(perfil.tipo === 'producao' ? perfil.nome.toUpperCase() : proc.operador ?? '');
  const [erro, setErro] = useState(null);
  const escolhidos = disponiveis.filter(x => marcados.has(x.id));
  useEffect(() => {
    const key = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const confirmar = () => {
    if (!escolhidos.length) return setErro('Marque os bags que estão entrando.');
    if (!operador.trim()) return setErro('Informe o operador.');
    const quem = operador.trim().toUpperCase();
    adicionarBags(proc.id, escolhidos.map(x => entradaDe(x, quem)));
    notify({
      status: `${escolhidos.length === 1 ? 'Bag adicionado' : 'Bags adicionados'} às ${localTime(agoraISO())}`,
      title: `${title(proc.setor)} · ${escolhidos.map(x => `bag ${x.n}`).join(', ')}`,
      detail: `${kg(escolhidos.reduce((s, x) => s + x.peso, 0))} · ${title(quem)}`,
      icon: 'plus'
    });
    onClose();
  };
  return (
    <>
      <div className="sheet-veil" style={{zIndex: 70}} onClick={onClose} />
      <div className="dialog dialog-largo" role="dialog" aria-modal="true" aria-label="Adicionar bag">
        <h2 className="wiz-q" style={{margin: 0}}>Adicionar bag na {title(proc.setor)}</h2>
        <p className="page-sub">
          A máquina continua rodando. Só aparecem bags de {title(material)} que estão aguardando esta máquina.
        </p>
        {disponiveis.length ? (
          <EscolherBags bags={disponiveis} marcados={marcados} onMarcar={marcar} material={material} />
        ) : (
          <div className="empty">Nenhum outro bag de {title(material)} aguardando {title(proc.setor)}.</div>
        )}
        <div style={{marginTop: 14}}>
          <OperadorCampo valor={operador} onChange={setOperador} />
        </div>
        <div className="wiz-foot" style={{marginTop: 16}}>
          <Button variant="secondary" size="lg" label="Voltar" onClick={onClose} />
          <div style={{display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
            {erro && <span className="wiz-err">{erro}</span>}
            <Button variant="primary" size="lg" icon="plus" label={`Adicionar ${escolhidos.length || ''}`.trim()} onClick={confirmar} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Finish a process with bags ---------- */

const PASSOS_FIM = ['Saída', 'Perdas', 'Conferir'];

export function FinalizarBags({proc, onClose}) {
  const {loteDe, ativos, finalizar, notify, lotes, balances} = useStore();
  const [passo, setPasso] = useState(0);
  const [saidas, setSaidas] = useState({});
  const [separa, setSepara] = useState(false);
  const [itens, setItens] = useState([{material: '', peso: '', destino: 'estoque'}]);
  const tiposPerda = ativos('tiposPerda');
  const [perdas, setPerdas] = useState({});
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState(null);
  const agora = Date.now();

  const lotesDoProcesso = [...new Set(proc.bags.map(e => e.lote))];
  const umLote = lotesDoProcesso.length === 1;
  // Next stop of each bag after this machine, along its own route.
  const linhas = proc.bags.map(e => {
    const lote = loteDe(e.lote);
    const rota = lote ? rotaDoBag(lote, e.i) : [];
    const proxima = rota[e.etapa + 1] ?? null;
    return {...e, lote: e.lote, loteObj: lote, rota, proxima, saida: saidas[e.bag] ?? ''};
  });
  const entrou = linhas.reduce((s, x) => s + x.peso, 0);
  const nosFilhos = itens.reduce((s, it) => s + n(it.peso), 0);
  const saiu = separa ? nosFilhos : linhas.reduce((s, x) => s + n(x.saida), 0);
  const quebra = Math.max(0, entrou - saiu);
  const somaPerdas = tiposPerda.reduce((s, t) => s + n(perdas[t]), 0);
  const tempo = horasLiquidas(proc, agora);
  const proximaComum = linhas.every(x => x.proxima === linhas[0].proxima) ? linhas[0].proxima : null;
  const setItem = (i, key, v) => setItens(list => list.map((it, j) => (j === i ? {...it, [key]: v} : it)));

  const avancar = () => {
    if (passo === 0) {
      if (separa) {
        if (itens.some(it => !it.material || !n(it.peso))) return setErro('Complete material e peso de cada separação.');
        if (nosFilhos > entrou) return setErro(`Saiu mais do que entrou (${kg(entrou)}).`);
      } else {
        const nomeBag = x => (umLote ? `${x.n}` : `${x.n} do lote ${x.lote}`);
        const falta = linhas.filter(x => !n(x.saida)).map(nomeBag);
        if (falta.length) return setErro(`Informe o peso de saída ${falta.length === 1 ? 'do bag' : 'dos bags'} ${falta.join(', ')}.`);
        const demais = linhas.find(x => n(x.saida) > x.peso);
        if (demais) return setErro(`O bag ${nomeBag(demais)} saiu com mais peso do que entrou (${kg(demais.peso)}).`);
      }
    }
    if (passo === 1 && somaPerdas > quebra) return setErro(`As perdas somam ${kg(somaPerdas)}, mas a quebra foi de ${kg(quebra)}.`);
    setErro(null);
    setPasso(p => (p === 0 && !quebra ? 2 : p + 1));
  };

  const confirmar = () => {
    const fim = agoraISO();
    const base = Date.now();
    const classificadas = Object.fromEntries(tiposPerda.filter(t => n(perdas[t]) > 0).map(t => [t, n(perdas[t])]));
    const filhos = [];
    const usados = new Set(lotes.map(l => l.lote));
    const aps = lotesDoProcesso.map((loteId, k) => {
      const lote = loteDe(loteId);
      const minhas = linhas.filter(x => x.lote === loteId);
      const usado = minhas.reduce((s, x) => s + x.peso, 0);
      const id = `ap-${base}-${k}`;
      const bags = minhas.map(x => ({
        bag: x.bag,
        n: x.n,
        i: x.i,
        material: x.material,
        etapa: x.etapa,
        pesoEntrada: x.peso,
        pesoSaida: separa ? null : n(x.saida),
        entrada: x.entrada,
        saida: fim,
        operador: x.operador,
        destino: separa ? 'separado' : x.proxima ? 'proxima' : 'estoque'
      }));
      const obtido = separa ? null : bags.reduce((s, x) => s + x.pesoSaida, 0);
      let separacao;
      if (separa) {
        // Each separated material becomes a new lot with one bag, linked to this one.
        const restante = minhas[0].rota.slice(minhas[0].etapa + 1);
        separacao = itens.map(it => {
          let code = `${loteId}-${slug(it.material)}`;
          for (let j = 2; usados.has(code); j++) code = `${loteId}-${slug(it.material)}${j}`;
          usados.add(code);
          const segue = it.destino === 'rota' && restante.length > 0;
          const rotaFilho = segue ? restante : [];
          filhos.push({
            lote: code,
            data: localDate(proc.inicio),
            cliente: lote.cliente,
            materiais: [it.material],
            nf: null,
            compra: lote.compra,
            tipo: lote.tipo,
            embalagem: lote.embalagem,
            cor: lote.cor,
            conferente: proc.operador,
            bags: [n(it.peso)],
            bagsMateriais: [it.material],
            pesoEntrada: n(it.peso),
            pesoNF: null,
            status: null,
            inicial: segue ? 'pendente' : 'estoque',
            rota: rotaFilho,
            rotaLog: [],
            galpao: lote.galpao,
            origem: {tipo: 'separacao', pai: loteId, apontamento: id}
          });
          return {material: it.material, peso: n(it.peso), lote: code, destino: segue ? 'rota' : 'estoque'};
        });
      }
      const saiuLote = separa ? nosFilhos : obtido;
      // Classified losses are shared among the lots in proportion to what each one lost.
      const parte = quebra ? Math.max(0, usado - saiuLote) / quebra : 0;
      return {
        id,
        lote: loteId,
        etapa: Math.max(0, (balances.get(loteId)?.rota ?? []).indexOf(proc.setor)),
        setor: proc.setor,
        data: localDate(proc.inicio),
        inicio: localTime(proc.inicio),
        fim: localTime(fim),
        horas: tempo,
        pausas: proc.pausas.map(p => ({...p, fim: p.fim ?? fim})),
        usado,
        obtido: separa ? undefined : obtido,
        separacao,
        perdas: Object.fromEntries(Object.entries(classificadas).map(([t, v]) => [t, Math.round(v * parte)]).filter(([, v]) => v > 0)),
        operador: proc.operador,
        obs: obs.trim(),
        processo: proc.id,
        bags
      };
    });
    finalizar({id: proc.id, filhos, aps});
    notify({
      status: `${title(proc.setor)} finalizada · rendimento ${pct(saiu / entrou).replace('+', '')}`,
      title: `${proc.bags.length} ${proc.bags.length === 1 ? 'bag' : 'bags'} · ${lotesDoProcesso.map(l => `lote ${l}`).join(', ')}`,
      detail: filhos.length
        ? `Separado em ${filhos.length} ${filhos.length === 1 ? 'lote' : 'lotes'}: ${filhos.map(f => f.lote).join(', ')}`
        : proximaComum
          ? `${kg(saiu)} seguem para ${title(proximaComum)}`
          : linhas.every(x => !x.proxima)
            ? `${kg(saiu)} foram para o estoque`
            : `${kg(saiu)} seguem cada bag para a sua próxima máquina`,
      icon: 'check'
    });
    onClose();
  };

  const opcoesMaterial = ativos('materiais');
  return (
    <motion.section className="panel wiz finishing" initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} transition={{duration: 0.3, ease: EASE_OUT}}>
      <div className="wiz-head">
        <div>
          <h2 className="section-title">
            Finalizar · {title(proc.setor)} · {proc.bags.length} {proc.bags.length === 1 ? 'bag' : 'bags'}
          </h2>
          <p className="page-sub" style={{fontSize: 14}}>
            {lotesDoProcesso.map(l => `Lote ${l}`).join(', ')} · entraram {kg(entrou)} · desde {localTime(proc.inicio)} · {title(proc.operador)}
          </p>
        </div>
        <Passos passos={quebra ? PASSOS_FIM : PASSOS_FIM.filter(p => p !== 'Perdas')} atual={!quebra && passo === 2 ? 1 : passo} />
      </div>

      {passo === 0 && (
        <Corpo passo={0}>
          <p className="wiz-q">{separa ? 'Em quais materiais a máquina separou?' : 'Quanto pesou cada bag na saída?'}</p>
          {umLote && (
            <label className="toggle" style={{marginBottom: 16}}>
              <input type="checkbox" checked={separa} onChange={e => setSepara(e.target.checked)} />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              A máquina separou o material em outros tipos
            </label>
          )}
          {separa ? (
            <div className="split-rows" style={{marginTop: 0}}>
              {itens.map((it, i) => (
                <div key={i} className="split-row">
                  <select className="input" value={it.material} onChange={e => setItem(i, 'material', e.target.value)}>
                    <option value="">Material</option>
                    {opcoesMaterial.map(m => (
                      <option key={m} value={m}>
                        {title(m)}
                      </option>
                    ))}
                  </select>
                  <input className="input" inputMode="numeric" placeholder="kg" value={it.peso} onChange={e => setItem(i, 'peso', e.target.value)} />
                  <select className="input" value={it.destino} onChange={e => setItem(i, 'destino', e.target.value)}>
                    <option value="estoque">Vai para o estoque</option>
                    {linhas[0].proxima && <option value="rota">Segue para {title(linhas[0].proxima)}</option>}
                  </select>
                  <Button variant="ghost" className="icon" icon="x" aria-label="Remover" disabled={itens.length === 1} onClick={() => setItens(list => list.filter((_, j) => j !== i))} />
                </div>
              ))}
              <div>
                <Button variant="secondary" size="sm" icon="plus" label="Adicionar material" onClick={() => setItens(list => [...list, {material: '', peso: '', destino: 'estoque'}])} />
              </div>
              <p className="wiz-note">Cada material vira um lote filho com um bag, ligado ao lote {lotesDoProcesso[0]}.</p>
            </div>
          ) : (
            <div className="saida-bags">
              <div className="saida-bag saida-topo">
                <span>Bag</span>
                <span className="num">Entrou</span>
                <span className="num">Saiu</span>
                <span>Vai para</span>
              </div>
              {linhas.map((x, k) => (
                <div key={x.bag} className="saida-bag">
                  <span>
                    <b>Bag {x.n}</b> · lote {x.lote}
                    <small> · {title(x.material)}</small>
                  </span>
                  <span className="num">{kg(x.peso)}</span>
                  <span className="saida-peso">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={x.saida}
                      autoFocus={k === 0}
                      onChange={e => setSaidas(s => ({...s, [x.bag]: e.target.value}))}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        const prox = e.currentTarget.closest('.saida-bag').nextElementSibling?.querySelector('input');
                        if (prox) prox.focus();
                        else e.currentTarget.blur();
                      }}
                      placeholder="0"
                      aria-label={`Peso de saída do bag ${x.n}`}
                    />
                    <span className="scale-unit">kg</span>
                  </span>
                  <span className="saida-destino">{x.proxima ? title(x.proxima) : 'Estoque'}</span>
                </div>
              ))}
              <div className="saida-bag saida-total">
                <span>Total</span>
                <span className="num">{kg(entrou)}</span>
                <span className="num">{kg(saiu)}</span>
                <span>{quebra ? `quebra ${kg(quebra)}` : ''}</span>
              </div>
            </div>
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
                <input className="input big-input" inputMode="numeric" value={perdas[t] ?? ''} onChange={e => setPerdas(p => ({...p, [t]: e.target.value}))} placeholder="0" />
              </label>
            ))}
          </div>
          {!tiposPerda.length && <p className="wiz-note">Nenhum tipo de perda cadastrado. A perda fica sem categoria; peça ao gerente para cadastrar os tipos.</p>}
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
              <b>{kg(entrou)}</b>
              <small>
                {proc.bags.length} {proc.bags.length === 1 ? 'bag' : 'bags'}
              </small>
            </div>
            <div>
              <span>{separa ? 'Lotes filhos' : 'Saiu'}</span>
              <b>{kg(saiu)}</b>
              <small>{separa ? `${itens.length} ${itens.length === 1 ? 'material' : 'materiais'}` : proximaComum ? `→ ${title(proximaComum)}` : linhas.every(x => !x.proxima) ? '→ estoque' : 'cada bag segue sua rota'}</small>
            </div>
            <div>
              <span>Quebra</span>
              <b style={quebra ? {color: 'var(--stop)'} : null}>{kg(quebra)}</b>
              <small>{pct(quebra / entrou).replace('+', '')}</small>
            </div>
            <div>
              <span>Tempo trabalhado</span>
              <b>{hours(tempo)}</b>
              <small>
                {localTime(proc.inicio)} até agora
                {proc.pausas.length ? ` · ${proc.pausas.length} ${proc.pausas.length === 1 ? 'parada' : 'paradas'}` : ''}
              </small>
            </div>
          </div>
          {!separa && (
            <div className="bags-lista-curta">
              {linhas.map(x => (
                <span key={x.bag}>
                  Bag {x.n} · {kg(x.peso)} → {kg(n(x.saida))} · {hours(tempoNaMaquina(x.entrada, null, proc.pausas, agora))} na máquina
                </span>
              ))}
            </div>
          )}
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
