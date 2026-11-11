import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider,
  getBezierPath, useEdgesState, useNodesInitialized, useNodesState, useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {useStore} from '../state/store.jsx';
import {date, divergencia, hours, kg, materialDe, nomeVolume, pct, title} from '../state/data.js';
import {horasLiquidas, obtidoDe, pausado, quebraDe} from '../state/balance.js';
import {arvoreDeLotes, construirMapa, filhosNoMapa, noEntrada, noEstoque, ondeEsta, posicaoDoLote} from '../state/mapa.js';
import {etapasTravadas} from '../state/rotas.js';
import {pode} from '../state/perfis.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {Status} from '../ui/Status.jsx';

const Edicao = createContext(null);
// The side column shows either a clicked step or the lot's own data.
const DADOS = 'dados-do-lote';

const ESTADOS = {
  feita: {label: 'Concluída', color: 'var(--ok)'},
  andamento: {label: 'Em processo', color: 'var(--run)'},
  parado: {label: 'Parado', color: 'var(--stop)'},
  fila: {label: 'Aguardando', color: 'var(--ready)'},
  proxima: {label: 'Próxima', color: 'var(--accent)'},
  futura: {label: 'Prevista', color: 'var(--subtle)'}
};

function useAgora(ms = 30000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

const hora = iso => new Date(iso).toTimeString().slice(0, 5);

function Linha({label, children, tone}) {
  return (
    <div className="no-linha">
      <span>{label}</span>
      <b style={tone ? {color: `var(--${tone})`} : null}>{children}</b>
    </div>
  );
}

const Entrada = ({emEdicao}) => <Handle type="target" position={Position.Left} className={emEdicao ? 'porta' : 'porta oculta'} />;
const Saida = ({emEdicao}) => (
  <>
    <Handle type="source" position={Position.Right} className={emEdicao ? 'porta' : 'porta oculta'} />
    <Handle id="baixo" type="source" position={Position.Bottom} className="porta oculta" isConnectable={false} />
  </>
);
const Aqui = ({children}) => (
  <div className="no-aqui">
    <Icon name="arrowRight" size={12} stroke={2.6} style={{transform: 'rotate(90deg)'}} />
    {children}
  </div>
);

function NoEntrada({data}) {
  return (
    <div className={`no no-lote ${data.foco ? 'foco' : 'outro'}`}>
      <Entrada />
      <div className="no-topo">
        <Icon name={data.origem ? 'layers' : 'scale'} size={14} />
        {data.origem === 'separacao' ? 'Separação' : data.origem === 'mistura' ? 'Mistura' : 'Entrada'}
        <span>{date(data.data)}</span>
      </div>
      <div className="no-nome mono">Lote {data.lote}</div>
      <div className="no-sub">{title(data.material)}</div>
      <div className="no-sub">{title(data.cliente)}</div>
      {data.pai && <div className="no-sub">Separado do lote <b className="mono">{data.pai}</b></div>}
      <Linha label="Peso">{kg(data.peso)}</Linha>
      {!data.foco && <div className="no-dica">Clique para abrir este lote</div>}
      <Saida emEdicao={data.emEdicao} />
    </div>
  );
}

function NoEtapa({data, selected}) {
  const ed = useContext(Edicao);
  const t = useAgora();
  const e = ESTADOS[data.estado];
  const pausa = data.pausas.find(p => !p.fim);
  const rodando = data.inicio ? horasLiquidas({inicio: data.inicio, pausas: data.pausas}, t) : 0;
  const aqui = data.maquina > 0 || data.fila > 0;
  return (
    <div className={`no no-etapa ${data.estado} ${data.foco ? 'foco' : 'outro'} ${selected ? 'marcado' : ''}`} style={{'--c': e.color}}>
      {aqui && <Aqui>Material aqui · {kg(data.maquina + data.fila)}</Aqui>}
      <Entrada emEdicao={data.emEdicao} />
      <div className="no-topo">
        <span className="no-num">
          {data.semRota ? '—' : data.estado === 'feita' ? <Icon name="check" size={12} stroke={3} /> : data.n}
        </span>
        <span className="no-estado">{e.label}</span>
        {data.travada && (
          <span title="Etapa já iniciada: não pode mudar" style={{marginLeft: 'auto', display: 'grid', color: 'var(--subtle)'}}>
            <Icon name="lock" size={13} />
          </span>
        )}
        {data.emEdicao && !data.travada && !data.semRota && (
          <button type="button" className="no-x nodrag nopan" aria-label={`Remover ${title(data.setor)}`} title="Remover da rota" onClick={ev => (ev.stopPropagation(), ed.remover(data.idx))}>
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      <div className="no-nome">{data.semRota ? 'Sem rota definida' : title(data.setor)}</div>
      {data.maquina > 0 && <Linha label="Na máquina" tone={data.estado === 'parado' ? 'stop' : 'run'}>{kg(data.maquina)}</Linha>}
      {data.fila > 0 && <Linha label="Aguardando" tone="ready">{kg(data.fila)}</Linha>}
      {data.inicio && (
        <>
          <Linha label="Operador">{title(data.operador)}</Linha>
          <Linha label={pausa ? 'Rodou' : 'Rodando há'}>{hours(rodando)}</Linha>
        </>
      )}
      {pausa && (
        <div className="no-alerta">
          <Icon name="pause" size={12} /> {title(pausa.motivo)} desde {hora(pausa.inicio)}
          {pausa.obs ? ` · ${pausa.obs}` : ''}
        </div>
      )}
      {data.entrou > 0 && (
        <>
          <Linha label="Processado">{kg(data.saiu)}</Linha>
          <Linha label="Quebra" tone={data.quebra ? 'stop' : null}>
            {kg(data.quebra)} ({pct(data.quebra / data.entrou).replace('+', '')})
          </Linha>
        </>
      )}
      {data.estado === 'futura' && <div className="no-dica">Material ainda não chegou</div>}
      {data.estado === 'proxima' && <div className="no-dica">Próximo destino do material</div>}
      <Saida emEdicao={data.emEdicao} />
    </div>
  );
}

function NoEstoque({data}) {
  return (
    <div className={`no no-fim ${data.pronto ? 'pronto' : ''} ${data.foco ? 'foco' : 'outro'}`} style={{'--c': data.pronto ? 'var(--stock)' : 'var(--subtle)'}}>
      {data.aqui && <Aqui>Material aqui · {kg(data.peso)}</Aqui>}
      <Entrada emEdicao={data.emEdicao} />
      <div className="no-topo">
        <Icon name="bag" size={14} /> Estoque
      </div>
      <div className="no-nome">Produto acabado</div>
      <Linha label="Saldo" tone={data.peso ? 'stock' : null}>{kg(data.peso)}</Linha>
      <Saida />
    </div>
  );
}

function NoEnviado({data}) {
  const clientes = [...new Set(data.envios.map(e => title(e.cliente)))].join(', ');
  return (
    <div className={`no no-fim pronto ${data.foco ? 'foco' : 'outro'}`} style={{'--c': 'var(--ok)'}}>
      <Entrada />
      <div className="no-topo">
        <Icon name="truck" size={14} /> Enviado
      </div>
      <div className="no-nome">{clientes}</div>
      <Linha label="Peso" tone="ok">{kg(data.peso)}</Linha>
      <Linha label="Envios">{data.envios.length}</Linha>
    </div>
  );
}

function NoFilhos({data}) {
  const ed = useContext(Edicao);
  return (
    <div className={`no no-filhos ${data.foco ? 'foco' : 'outro'}`}>
      <Handle id="topo" type="target" position={Position.Top} className="porta oculta" isConnectable={false} />
      <div className="no-topo">
        <Icon name="layers" size={14} /> {data.filhos.length} {data.filhos.length === 1 ? 'lote filho' : 'lotes filhos'}
        <span>{kg(data.peso)}</span>
      </div>
      {data.filhos.slice(0, 4).map(f => (
        <div key={f.lote} className="no-linha">
          <b className="filho-id" title={f.lote}>{f.lote}</b>
          <span>{f.onde}</span>
        </div>
      ))}
      {data.filhos.length > 4 && <div className="no-dica">e mais {data.filhos.length - 4}</div>}
      <button type="button" className="no-abrir nodrag nopan" onClick={ev => (ev.stopPropagation(), ed.abrirFilhos(data.lote))}>
        <Icon name="chevronDown" size={14} /> Abrir lotes filhos
      </button>
    </div>
  );
}

function ArestaFluxo({id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data}) {
  const ed = useContext(Edicao);
  const [path, x, y] = getBezierPath({sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition});
  const marcado = ed?.alvo === data.inserir && data.inserir != null;
  return (
    <>
      <BaseEdge id={id} path={path} className={`aresta ${data.estado} ${data.fluxo === 'segue' ? 'fluxo-futuro' : data.fluxo ? 'fluxo' : 'apagada'}`} />
      <EdgeLabelRenderer>
        {data.inserir != null && (
          <button
            type="button"
            className={`aresta-mais nodrag nopan ${marcado ? 'on' : ''}`}
            style={{transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`}}
            title="Inserir máquina aqui"
            aria-label="Inserir máquina aqui"
            onClick={() => ed.marcarAlvo(data.inserir)}
          >
            <Icon name="plus" size={12} stroke={2.6} />
          </button>
        )}
        {data.estado === 'ramo' && !data.semRotulo && (
          <span className={`aresta-peso ${data.fluxo ? 'fluxo' : ''}`} style={{transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`}}>
            {data.peso ? kg(data.peso) : data.tipoRamo === 'mistura' ? 'mistura' : 'separação'}
          </span>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {entrada: NoEntrada, etapa: NoEtapa, estoque: NoEstoque, enviado: NoEnviado, filhos: NoFilhos};
const edgeTypes = {fluxo: ArestaFluxo};

// One mark per route step, then the stock: the lot's position at a glance.
function Trilho({pos}) {
  if (!pos.total) return null;
  return (
    <span className="trilho" aria-hidden="true">
      {pos.estados.map((e, i) => (
        <i key={i} className={e} />
      ))}
      <i className={pos.fim ? 'feita fim' : 'fim'} />
    </span>
  );
}

function LinhaDoLote({no, nivel, foco, onEscolher, expandidos, onAlternar}) {
  const {balances, abertos, statusDe} = useStore();
  const l = no.lote;
  const pos = posicaoDoLote(l, balances.get(l.lote), abertos);
  const status = statusDe(l);
  const aberto = expandidos.has(l.lote);
  return (
    <>
      <div className={`arv-linha ${foco === l.lote ? 'on' : ''}`} style={{'--nivel': nivel}}>
        {no.filhos.length > 0 ? (
          <button
            type="button"
            className="arv-seta"
            aria-expanded={aberto}
            aria-label={`${aberto ? 'Fechar' : 'Abrir'} lotes filhos de ${l.lote}`}
            onClick={() => onAlternar(l.lote)}
          >
            <Icon name={aberto ? 'chevronDown' : 'chevronRight'} size={14} />
          </button>
        ) : (
          <span className="arv-seta vazio" />
        )}
        <button type="button" className="arv-item" onClick={() => onEscolher(l.lote)}>
          <span className="arv-topo">
            <b className="mono" title={l.lote}>{l.lote}</b>
            {status === 'HISTORICO' ? <span className="maq-livre">Sem saldo</span> : <Status value={status} short />}
          </span>
          <small>
            {pos.etapa ? `Etapa ${pos.etapa} de ${pos.total} · ` : ''}
            {pos.texto}
          </small>
          <Trilho pos={pos} />
          {no.filhos.length > 0 && <small className="arv-filhos">{no.filhos.length} {no.filhos.length === 1 ? 'lote filho' : 'lotes filhos'}</small>}
        </button>
      </div>
      {aberto &&
        no.filhos.map(f => (
          <LinhaDoLote key={f.lote.lote} no={f} nivel={nivel + 1} foco={foco} onEscolher={onEscolher} expandidos={expandidos} onAlternar={onAlternar} />
        ))}
    </>
  );
}

function ListaDeLotes({foco, onEscolher, expandidos, onAlternar}) {
  const {fila, lotes, balances} = useStore();
  const [busca, setBusca] = useState('');
  const q = busca.trim().toUpperCase();
  const arvore = useMemo(() => arvoreDeLotes({lotes, balances, fila}), [lotes, balances, fila]);
  // A search looks at every lot, children and finished ones included.
  const encontrados = q
    ? lotes.filter(l => l.lote.toUpperCase().includes(q) || l.cliente?.includes(q) || materialDe(l).includes(q)).slice(0, 30)
    : null;
  return (
    <aside className="mapa-lotes">
      <div className="search" style={{maxWidth: 'none', flex: 'none'}}>
        <Icon name="search" size={16} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar lote" aria-label="Buscar lote" />
      </div>
      <p className="label" style={{margin: 0}}>
        {encontrados ? `${encontrados.length} encontrados` : `${arvore.length} lotes pai ativos`}
      </p>
      <div className="mapa-lista">
        {encontrados
          ? encontrados.map(l => (
              <LinhaDoLote key={l.lote} no={{lote: l, filhos: []}} nivel={0} foco={foco} onEscolher={onEscolher} expandidos={expandidos} onAlternar={onAlternar} />
            ))
          : arvore.map(no => (
              <LinhaDoLote key={no.lote.lote} no={no} nivel={0} foco={foco} onEscolher={onEscolher} expandidos={expandidos} onAlternar={onAlternar} />
            ))}
        {!encontrados && !arvore.length && <div className="empty">Nenhum lote ativo.</div>}
      </div>
    </aside>
  );
}

function Resumo({lote, b, abertos}) {
  const onde = ondeEsta(lote, b, abertos);
  const partes = onde.agora.flatMap(e => [
    e.maquina > 0 && `${kg(e.maquina)} ${e.estado === 'parado' ? 'parados em' : 'processando em'} ${title(e.setor)}`,
    e.fila > 0 && `${kg(e.fila)} aguardando em ${title(e.setor)}`
  ]).filter(Boolean);
  if (onde.pendenteSemRota) partes.push(`${kg(onde.pendenteSemRota)} sem rota definida`);
  if (onde.estoque) partes.push(`${kg(onde.estoque)} em estoque`);
  if (onde.enviado) partes.push(`${kg(onde.enviado)} já enviados`);
  return (
    <div className="mapa-onde">
      <span className="label" style={{margin: 0}}>Onde está agora</span>
      <b>{partes.join(' · ') || 'Sem saldo neste lote'}</b>
      {onde.proxima && (
        <span className="mapa-prox">
          <Icon name="arrowRight" size={14} /> Depois: {title(onde.proxima.setor)}
        </span>
      )}
    </div>
  );
}

function Cabecalho({titulo, onFechar}) {
  return (
    <div className="section-head">
      <h2 className="section-title">{titulo}</h2>
      <button type="button" className="no-x" aria-label="Fechar detalhe" onClick={onFechar}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function Apontamento({a}) {
  const perdas = [
    a.po > 0 && `pó ${kg(a.po)}`,
    a.lixo > 0 && `lixo ${kg(a.lixo)}`,
    a.contaminado > 0 && `contaminado ${kg(a.contaminado)}`
  ].filter(Boolean);
  const quebra = quebraDe(a);
  return (
    <div className="mapa-ap">
      <b>
        {date(a.data, true)}
        {a.inicio ? ` · ${a.inicio}–${a.fim}` : ''}
      </b>
      <span>{title(a.operador) || 'Sem operador'}</span>
      <span>
        {kg(a.usado)} → {kg(obtidoDe(a))}
        {quebra > 0 ? ` · quebra ${kg(quebra)}` : ''}
      </span>
      {perdas.length > 0 && <span>{perdas.join(' · ')}</span>}
      {a.separacao?.map(x => (
        <span key={x.lote}>
          Filho <b className="mono">{x.lote}</b>: {kg(x.peso)}
        </span>
      ))}
      {a.continua && <span>Continuou no lote: {kg(a.continua.peso)}</span>}
      {a.voltouParaFila > 0 && <span>Voltou para a fila: {kg(a.voltouParaFila)}</span>}
      {a.pausas?.length > 0 && <span>Paradas: {[...new Set(a.pausas.map(x => title(x.motivo)))].join(', ')}</span>}
      {a.obs && <small>“{a.obs}”</small>}
    </div>
  );
}

function Detalhe({no, onFechar, onIniciar}) {
  const {data} = no;
  return (
    <div className="mapa-detalhe">
      <Cabecalho titulo={data.semRota ? 'Sem rota definida' : title(data.setor)} onFechar={onFechar} />
      {onIniciar && data.fila > 0 && !data.semRota && <Button variant="primary" size="sm" icon="play" label="Iniciar processo" onClick={onIniciar} />}
      {data.apontamentos.length ? (
        <div className="mapa-aps">
          {data.apontamentos.map(a => (
            <Apontamento key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <p className="page-sub">Sem apontamentos finalizados nesta etapa.</p>
      )}
    </div>
  );
}

function DadosDoLote({lote, b, onFechar}) {
  const {openDialog, perfil} = useStore();
  const diff = divergencia(lote);
  const fatos = [
    ['Peso de entrada', kg(b.entrada)],
    ['Pendente', kg(b.pend)],
    ['Em estoque', kg(b.est)],
    ['Enviado', kg(b.enviado)],
    ['Quebra', kg(b.quebra)],
    ['Rendimento', b.rendimento == null ? '—' : pct(b.rendimento).replace('+', '')],
    ['Cor', title(lote.cor) || '—'],
    ['Tipo', title(lote.tipo) || '—'],
    ['Compra', title(lote.compra) || '—'],
    ['Embalagem', title(lote.embalagem) || '—'],
    ['Recebido em', date(lote.data, true)],
    ['Nota fiscal', lote.nf ? String(lote.nf) : 'Sem NF'],
    ['Peso da NF', kg(lote.pesoNF)],
    ['Balança × NF', diff ? `${diff.kg > 0 ? '+' : ''}${kg(diff.kg)} (${pct(diff.pct)})` : '—'],
    ['Conferente', title(lote.conferente) || '—'],
    ['Galpão', title(lote.galpao) || '—']
  ];
  return (
    <div className="mapa-detalhe">
      <Cabecalho titulo="Dados do lote" onFechar={onFechar} />
      {b.est > 0 && pode(perfil, 'enviar') && (
        <Button size="sm" icon="truck" label="Enviar" onClick={() => openDialog({tipo: 'envio', lote: lote.lote})} />
      )}
      <div className="facts mapa-fatos">
        {fatos.map(([rotulo, valor]) => (
          <div key={rotulo} className="fact">
            <span>{rotulo}</span>
            <b>{valor}</b>
          </div>
        ))}
      </div>
      {lote.obs && <p className="page-sub">“{lote.obs}”</p>}
      {lote.bags.length > 0 && (
        <>
          <p className="label mapa-subtitulo">
            {lote.bags.length} {nomeVolume(lote.embalagem, lote.bags.length).toLowerCase()} pesados
          </p>
          <div className="lote-volumes-resumo">
            <span>Total <b>{kg(lote.bags.reduce((s, p) => s + p, 0))}</b></span>
            <span>Média <b>{kg(Math.round(lote.bags.reduce((s, p) => s + p, 0) / lote.bags.length))}</b></span>
            {lote.bags.length > 1 && (
              <span>
                Menor <b>{kg(Math.min(...lote.bags))}</b> · Maior <b>{kg(Math.max(...lote.bags))}</b>
              </span>
            )}
          </div>
          <div className="lote-volumes">
            {lote.bags.map((peso, i) => (
              <div key={i} className="lote-volume">
                <span>
                  {nomeVolume(lote.embalagem)} {i + 1}
                </span>
                <b>{kg(peso)}</b>
              </div>
            ))}
          </div>
        </>
      )}
      {b.envios.length > 0 && (
        <>
          <p className="label mapa-subtitulo">Envios</p>
          <div className="mapa-aps" style={{marginTop: 0}}>
            {b.envios.map(e => (
              <div key={e.id} className="mapa-ap">
                <b>{date(e.data, true)} · {kg(e.peso)}</b>
                <span>{title(e.cliente)}</span>
                <span>NF {e.nf ?? '—'} · {title(e.responsavel) || '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {lote.rotaLog?.length > 0 && (
        <>
          <p className="label mapa-subtitulo">Mudanças de rota</p>
          <div className="mapa-aps" style={{marginTop: 0}}>
            {lote.rotaLog.map((r, i) => (
              <div key={i} className="mapa-ap">
                <b>{date(r.quando.slice(0, 10), true)} · {title(r.por)}</b>
                <span>{r.depois.map(title).join(' → ') || 'Direto para o estoque'}</span>
                <small>Antes: {r.antes.map(title).join(' → ') || 'sem rota'}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Maquinas({alvo, rota, travadas, onInserir, onCancelarAlvo}) {
  const {ativos} = useStore();
  const pos = alvo ?? rota.length;
  const texto = alvo == null
    ? 'Clique para colocar no fim da rota ou arraste para o mapa.'
    : `Inserindo antes de ${rota[pos] ? title(rota[pos]) : 'Estoque'}. Escolha a máquina.`;
  return (
    <div className="mapa-maquinas">
      <div className="section-head" style={{marginBottom: 4}}>
        <h2 className="section-title">Máquinas</h2>
        {alvo != null && (
          <button type="button" className="see-all" onClick={onCancelarAlvo}>Cancelar</button>
        )}
      </div>
      <p className="page-sub" style={{marginBottom: 8}}>{texto}</p>
      <div className="mapa-paleta">
        {ativos('processos').map(p => (
          <button
            key={p}
            type="button"
            draggable
            className="mapa-maq"
            onDragStart={e => e.dataTransfer.setData('text/plain', p)}
            onClick={() => onInserir(p, Math.max(pos, travadas))}
          >
            <Icon name="factory" size={14} />
            {title(p)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Canvas({foco, onFoco, expandidos, onAlternar}) {
  const {lotes, balances, misturas, abertos, loteDe, perfil, mudarRota, notify, go, statusDe} = useStore();
  const lote = loteDe(foco);
  const b = balances.get(foco);
  const [rascunho, setRascunho] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [paleta, setPaleta] = useState(false);
  const {fitView, screenToFlowPosition} = useReactFlow();

  const rotaSalva = b.rota;
  const rota = rascunho ?? rotaSalva;
  const mudou = rascunho && JSON.stringify(rascunho) !== JSON.stringify(rotaSalva);
  const travadas = etapasTravadas(b);
  // Only a lot that still has material to process can change route.
  const editavel = pode(perfil, 'editarRota') && b.pend + b.maquina > 0;

  const mapa = useMemo(
    () => construirMapa({foco, rotaFoco: rota, lotes, balances, misturas, abertos, editavel, expandidos}),
    [foco, rota, lotes, balances, misturas, abertos, editavel, expandidos]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(mapa.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(mapa.edges);
  // Dragged positions last until the drawing itself changes: the route or the lots on it.
  const rotaChave = JSON.stringify([rota, mapa.familia]);
  const qtdFilhos = filhosNoMapa(foco, {lotes, balances, misturas}).length;
  const filhosAbertos = expandidos.has(foco);

  useEffect(() => {
    // Positions the user dragged survive live updates, until the route itself changes.
    setNodes(atuais => {
      const antes = new Map(atuais.map(n => [n.id, n]));
      return mapa.nodes.map(n => ({...n, position: antes.get(n.id)?.data.chave === rotaChave ? antes.get(n.id).position : n.position, data: {...n.data, chave: rotaChave}}));
    });
    setEdges(mapa.edges);
  }, [mapa]);

  // The view opens on the lot and what branches off it; the zoom control shows the whole family.
  const ajustar = useCallback(() => {
    const ramos = mapa.edges.filter(e => e.data.estado === 'ramo' && e.data.foco).flatMap(e => [e.source, e.target]);
    // Everything on the selected lot's path, plus what branches straight off it.
    const perto = mapa.nodes.filter(n => n.className || n.data.foco || ramos.includes(n.id)).map(n => ({id: n.id}));
    requestAnimationFrame(() => fitView({nodes: perto, padding: 0.14, maxZoom: 1, duration: 200}));
  }, [fitView, mapa]);
  const medidos = useNodesInitialized();
  useEffect(() => {
    if (!medidos) return undefined;
    const id = setTimeout(ajustar, 120);
    return () => clearTimeout(id);
  }, [medidos, foco, rotaChave]);
  // Opening the side column narrows the canvas, so the view refits to the new width.
  const telaRef = useRef(null);
  const ajustarRef = useRef(ajustar);
  ajustarRef.current = ajustar;
  useEffect(() => {
    let espera;
    let largura = telaRef.current.clientWidth;
    const observador = new ResizeObserver(() => {
      if (telaRef.current.clientWidth === largura) return;
      largura = telaRef.current.clientWidth;
      clearTimeout(espera);
      espera = setTimeout(() => ajustarRef.current(), 120);
    });
    observador.observe(telaRef.current);
    return () => {
      clearTimeout(espera);
      observador.disconnect();
    };
  }, []);
  useEffect(() => {
    setRascunho(null);
    setAlvo(null);
    setSelecionado(null);
    setPaleta(false);
  }, [foco]);

  const aplicar = proxima => {
    setRascunho(proxima);
    setAlvo(null);
    setSelecionado(null);
    setPaleta(false);
  };
  const inserir = (maquina, pos) => {
    const lista = [...rota];
    lista.splice(pos, 0, maquina);
    aplicar(lista);
  };
  const remover = i => aplicar(rota.filter((_, j) => j !== i));

  const edicao = useMemo(
    () => ({remover, abrirFilhos: onAlternar, alvo, marcarAlvo: k => {
        setAlvo(a => (a === k ? null : k));
        setPaleta(true);
      }}),
    [rota, alvo, onAlternar]
  );

  // Drawing a wire: the target machine moves to right after the source. A wire to the stock
  // ends the route there.
  const indiceDe = id => {
    if (id === noEntrada(foco)) return -1;
    const m = id.match(/:etapa:(\d+)$/);
    return m && id.startsWith(`${foco}:`) ? Number(m[1]) : null;
  };
  const conexaoValida = ({source, target}) => {
    const de = indiceDe(source);
    if (de == null || de < travadas - 1) return false;
    if (target === noEstoque(foco)) return de < rota.length - 1;
    const para = indiceDe(target);
    return para != null && para >= travadas && para > de + 1;
  };
  const conectar = ({source, target}) => {
    if (!conexaoValida({source, target})) return;
    const de = indiceDe(source);
    if (target === noEstoque(foco)) return aplicar(rota.slice(0, de + 1));
    const para = indiceDe(target);
    const lista = [...rota];
    const [maquina] = lista.splice(para, 1);
    lista.splice(de + 1, 0, maquina);
    aplicar(lista);
  };

  const soltar = e => {
    e.preventDefault();
    const maquina = e.dataTransfer.getData('text/plain');
    if (!maquina || !editavel) return;
    const {x} = screenToFlowPosition({x: e.clientX, y: e.clientY});
    const etapas = nodes.filter(n => n.type === 'etapa' && n.data.foco && !n.data.semRota);
    const k = etapas.filter(n => n.position.x + 120 < x).length;
    inserir(maquina, Math.max(k, travadas));
  };

  const salvar = () => {
    mudarRota(foco, rascunho);
    setRascunho(null);
    notify({status: 'Rota alterada', title: `Lote ${foco}`, detail: rascunho.map(title).join(' → ') || 'direto para o estoque', icon: 'arrowRight'});
  };

  const clicarNo = (_, no) => {
    if (no.type === 'filhos') return undefined;
    if (no.data.lote !== foco) return onFoco(no.data.lote, Boolean(mudou));
    if (no.type === 'etapa') setSelecionado(no.id);
    else if (no.type === 'entrada') setSelecionado(DADOS);
    else setSelecionado(null);
  };
  const noSelecionado = selecionado && selecionado !== DADOS ? nodes.find(n => n.id === selecionado) : null;

  return (
    <div className="mapa-centro">
      <header className="mapa-cabeca">
        <div className="mapa-titulo">
          <div>
            <h1 className="page-title mono">Lote {foco}</h1>
            <p className="page-sub">
              {title(lote.cliente)} · {title(materialDe(lote))}
            </p>
          </div>
          <Status value={statusDe(lote)} />
        </div>
        <Resumo lote={lote} b={b} abertos={abertos} />
        <div className="page-actions">
          {lote.origem?.tipo === 'separacao' && (
            <Button size="sm" icon="arrowRight" className="voltar-pai" label={`Voltar ao lote pai ${lote.origem.pai}`} onClick={() => onFoco(lote.origem.pai, Boolean(mudou))} />
          )}
          {qtdFilhos > 0 && (
            <Button
              size="sm"
              icon={filhosAbertos ? 'chevronUp' : 'chevronDown'}
              label={`${filhosAbertos ? 'Fechar' : 'Abrir'} lotes filhos (${qtdFilhos})`}
              onClick={() => onAlternar(foco)}
            />
          )}
          {editavel && <Button size="sm" icon="plus" label="Máquinas" onClick={() => setPaleta(p => !p)} />}
          <Button size="sm" icon="layers" label="Dados do lote" onClick={() => setSelecionado(atual => (atual === DADOS ? null : DADOS))} />
          <Button size="sm" icon="refresh" label="Centralizar" onClick={ajustar} />
        </div>
      </header>

      <div className="mapa-legenda">
        <span className="leg selecionado">Até onde o material chegou</span>
        <span className="leg a-seguir">Para onde deve seguir</span>
        <span className="leg aqui">Material aqui</span>
        <span className="leg feita">Concluída</span>
        <span className="leg parado">Parado</span>
        <span className="leg proxima">Próxima</span>
        <span className="leg futura">Prevista</span>
      </div>
      <div className="mapa-corpo">
        <Edicao.Provider value={edicao}>
          <div className="mapa-tela" ref={telaRef} onDrop={soltar} onDragOver={e => e.preventDefault()}>
            {mudou && (
              <div className="mapa-salvar">
                <span>
                  <b>Nova rota:</b> {rota.map(title).join(' → ') || 'direto para o estoque'}
                </span>
                <Button size="sm" label="Desfazer" onClick={() => setRascunho(null)} />
                <Button size="sm" variant="primary" icon="check" label="Salvar rota" onClick={salvar} />
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={conectar}
              isValidConnection={conexaoValida}
              onNodeClick={clicarNo}
              onPaneClick={() => setSelecionado(null)}
              deleteKeyCode={null}
              minZoom={0.2}
              maxZoom={1.5}
              attributionPosition="bottom-center"
              fitView
              fitViewOptions={{padding: 0.12, maxZoom: 1}}
            >
              <Background gap={20} size={1} color="#d9dde3" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" nodeColor={n => ({fluxo: '#c81e1e', 'fluxo-futuro': '#f07d00'}[n.className] ?? '#c3c9d1')} maskColor="#f5f6f8b3" />
            </ReactFlow>
          </div>
        </Edicao.Provider>

        {((editavel && paleta) || noSelecionado || selecionado === DADOS) && (
          <aside className="mapa-direita">
            {selecionado === DADOS && <DadosDoLote lote={lote} b={b} onFechar={() => setSelecionado(null)} />}
            {noSelecionado && <Detalhe no={noSelecionado} onFechar={() => setSelecionado(null)} onIniciar={pode(perfil, 'apontar') ? () => go('apontar', {lote: foco}) : null} />}
            {editavel && paleta && <Maquinas alvo={alvo} rota={rota} travadas={travadas} onInserir={inserir} onCancelarAlvo={() => setAlvo(null)} />}
          </aside>
        )}
      </div>
    </div>
  );
}

export function Mapa({initial}) {
  const {fila, lotes, loteDe} = useStore();
  const primeiro = useMemo(() => {
    const ordem = ['PARADO', 'EM PROCESSO', 'AGUARDANDO INICIO', 'A PRONTA ENTREGA'];
    const ativos = fila.filter(o => !o.legado && o.lote && loteDe(o.lote)?.origem?.tipo !== 'separacao');
    return [...ativos].sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status))[0]?.lote ?? lotes[lotes.length - 1]?.lote;
  }, []);
  const [foco, setFoco] = useState(initial?.lote && loteDe(initial.lote) ? initial.lote : primeiro);
  // Parent lots stay closed until someone opens them.
  const [expandidos, setExpandidos] = useState(() => new Set());
  const alternar = useCallback(id => {
    setExpandidos(atual => {
      const proximo = new Set(atual);
      if (!proximo.delete(id)) proximo.add(id);
      return proximo;
    });
  }, []);
  const trocar = useRef(null);
  trocar.current = (id, pendente) => {
    if (id === foco) return;
    if (pendente && !window.confirm('A rota alterada não foi salva. Descartar a alteração?')) return;
    setFoco(id);
  };
  if (!foco || !loteDe(foco))
    return (
      <main className="page">
        <h1 className="page-title">Mapa do lote</h1>
        <div className="painel-empty panel">Nenhum lote registrado. Comece por um recebimento.</div>
      </main>
    );
  return (
    <main className="page mapa-page">
      <ListaDeLotes
        foco={foco}
        onEscolher={id => trocar.current(id, document.querySelector('.mapa-salvar') != null)}
        expandidos={expandidos}
        onAlternar={alternar}
      />
      <ReactFlowProvider>
        <Canvas foco={foco} onFoco={(id, pendente) => trocar.current(id, pendente)} expandidos={expandidos} onAlternar={alternar} />
      </ReactFlowProvider>
    </main>
  );
}
