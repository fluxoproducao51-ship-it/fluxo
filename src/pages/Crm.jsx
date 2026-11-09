import {useEffect, useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {date, hours, kg, pct, title, today} from '../state/data.js';
import {
  MOTIVOS_PERDA, ORIGENS, PORTES, RELACOES, SEGMENTOS, SITUACOES_EMPRESA, TIPOS_ATIVIDADE, TIPOS_NEGOCIO,
  brl, estoquePorMaterial, plantaDoCliente, ponderadoDe, proximoPasso, tempoDeProducao, valorDe
} from '../state/crm.js';
import {sugerirRota} from '../state/rotas.js';
import {Button} from '../ui/Button.jsx';
import {parseKg} from '../ui/Dialog.jsx';
import {Icon} from '../ui/Icon.jsx';
import {SectionHeader} from '../ui/SectionHeader.jsx';

const numero = texto => {
  const n = Number(String(texto ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const vazioParaNulo = texto => (String(texto ?? '').trim() ? String(texto).trim() : null);

function Janela({titulo, onFechar, largura = 620, children}) {
  useEffect(() => {
    const tecla = e => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);
  return (
    <>
      <div className="sheet-veil" style={{zIndex: 70}} onClick={onFechar} />
      <div className="dialog crm-janela" role="dialog" aria-modal="true" aria-label={titulo} style={{width: `min(${largura}px, calc(100vw - 32px))`}}>
        <div className="section-head">
          <h2 className="wiz-q" style={{margin: 0}}>{titulo}</h2>
          <button type="button" className="no-x" aria-label="Fechar" onClick={onFechar}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function Campo({rotulo, largo, children}) {
  return (
    <label className={`field ${largo ? 'wide' : ''}`}>
      <span>{rotulo}</span>
      {children}
    </label>
  );
}

function Selecao({valor, onChange, opcoes, vazio = 'Selecione'}) {
  const lista = Array.isArray(opcoes) ? opcoes.map(o => [o, o]) : Object.entries(opcoes);
  return (
    <select className="input" value={valor ?? ''} onChange={e => onChange(e.target.value)}>
      {vazio && <option value="">{vazio}</option>}
      {lista.map(([id, rotulo]) => (
        <option key={id} value={id}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}

// Asks once more before deleting, in place, like the route cards do.
function Remover({rotulo = 'Remover', pergunta, onConfirmar}) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) return <Button variant="danger" icon="trash" label={rotulo} onClick={() => setConfirmando(true)} />;
  return (
    <span className="crm-confirma">
      {pergunta}
      <Button variant="danger-solido" size="sm" label="Sim, remover" onClick={onConfirmar} />
      <Button size="sm" label="Não" onClick={() => setConfirmando(false)} />
    </span>
  );
}

/* ---------- Plant link ---------- */

function PainelDaPlanta({empresa}) {
  const {lotes, balances, envios, abrirLote, cadastros, crmSalvar} = useStore();
  const planta = useMemo(() => plantaDoCliente(empresa.clientePlanta, {lotes, balances, envios}), [empresa.clientePlanta, lotes, balances, envios]);
  const clientes = cadastros.clientes.filter(c => c.ativo).map(c => c.nome).sort();
  return (
    <section className="panel">
      <SectionHeader title="Na planta" />
      <Campo rotulo="Cliente vinculado na planta">
        <Selecao
          valor={empresa.clientePlanta}
          onChange={v => crmSalvar('empresas', {...empresa, clientePlanta: v || null})}
          opcoes={Object.fromEntries(clientes.map(c => [c, title(c)]))}
          vazio="Sem vínculo"
        />
      </Campo>
      {!planta ? (
        <p className="page-sub" style={{marginTop: 8}}>Vincule ao cliente da planta para ver o material recebido, o estoque e os envios desta empresa.</p>
      ) : (
        <>
          <div className="crm-numeros">
            <div><span>Recebido</span><b>{kg(planta.recebido)}</b></div>
            <div><span>Em processo</span><b>{kg(planta.emProcesso)}</b></div>
            <div><span>Em estoque</span><b>{kg(planta.emEstoque)}</b></div>
            <div><span>Enviado</span><b>{kg(planta.enviado)}</b></div>
            <div><span>Rendimento</span><b>{planta.rendimento == null ? '—' : pct(planta.rendimento).replace('+', '')}</b></div>
          </div>
          <p className="label" style={{marginTop: 12}}>{planta.lotes.length} lotes</p>
          <div className="crm-lotes">
            {planta.lotes.slice(0, 12).map(l => (
              <button key={l.lote} type="button" className="lote-chip" title={date(l.data, true)} onClick={() => abrirLote(l.lote)}>
                {l.lote}
              </button>
            ))}
            {planta.lotes.length > 12 && <span className="maq-livre">e mais {planta.lotes.length - 12}</span>}
          </div>
        </>
      )}
    </section>
  );
}

// What the plant can deliver for this deal, right on the deal.
function ViabilidadeDaPlanta({negocio}) {
  const {lotes, balances, cadastros, openDialog} = useStore();
  const empresaNome = useEmpresa(negocio.empresaId)?.clientePlanta;
  if (!negocio.material) return <p className="page-sub">Escolha o material para ver o que a planta tem disponível.</p>;
  const estoque = estoquePorMaterial({lotes, balances}).get(negocio.material);
  const rota = sugerirRota(negocio.material, cadastros.rotas.filter(r => r.ativo));
  const tempo = tempoDeProducao(negocio.quantidadeKg, rota, cadastros.processos);
  const falta = negocio.quantidadeKg ? Math.max(0, negocio.quantidadeKg - (estoque?.kg ?? 0)) : 0;
  return (
    <div className="crm-viabilidade">
      {negocio.tipo === 'venda' && (
        <div>
          <span>Em estoque agora</span>
          <b style={falta > 0 ? {color: 'var(--ready)'} : {color: 'var(--ok)'}}>{kg(estoque?.kg ?? 0)}</b>
          {falta > 0 && negocio.quantidadeKg > 0 && <small>faltam {kg(falta)} para este pedido</small>}
        </div>
      )}
      <div>
        <span>Rota do material</span>
        <b>{rota ? title(rota.nome) : 'Sem rota'}</b>
        <small>{rota ? rota.etapas.map(title).join(' → ') : 'Ligue o material a uma rota para a logística poder receber.'}</small>
      </div>
      {tempo && (
        <div>
          <span>Tempo de máquina</span>
          <b>{tempo.conhecidas ? hours(tempo.horas) : '—'}</b>
          <small>{tempo.conhecidas === tempo.total ? 'pela capacidade cadastrada' : `capacidade informada em ${tempo.conhecidas} de ${tempo.total} máquinas`}</small>
        </div>
      )}
      {negocio.tipo === 'venda' && negocio.situacao === 'ganho' && estoque && (
        <div className="crm-enviar">
          <span>Registrar envio do lote</span>
          {estoque.lotes.map(l => (
            <Button
              key={l.lote}
              size="sm"
              icon="truck"
              label={`${l.lote} · ${kg(l.kg)}`}
              onClick={() => openDialog({tipo: 'envio', lote: l.lote, cliente: empresaNome ?? undefined, peso: negocio.quantidadeKg})}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function useEmpresa(id) {
  const {crm} = useStore();
  return crm.empresas.find(e => e.id === id);
}

/* ---------- Activities ---------- */

function NovaAtividade({empresaId, negocioId, onSalvo}) {
  const {crmSalvar} = useStore();
  const [tipo, setTipo] = useState('ligacao');
  const [titulo, setTitulo] = useState('');
  const [vencimento, setVencimento] = useState(today());
  const [kgAmostra, setKgAmostra] = useState('');
  const salvar = () => {
    if (!titulo.trim() && tipo !== 'amostra') return;
    const nota = tipo === 'nota';
    crmSalvar('atividades', {
      id: crypto.randomUUID(),
      tipo,
      titulo: titulo.trim() || TIPOS_ATIVIDADE[tipo],
      vencimento: nota ? today() : vencimento || null,
      concluida: nota,
      concluidaEm: nota ? today() : null,
      empresaId: empresaId ?? null,
      negocioId: negocioId ?? null,
      quantidadeKg: tipo === 'amostra' ? parseKg(kgAmostra) : null
    });
    setTitulo('');
    setKgAmostra('');
    onSalvo?.();
  };
  return (
    <div className="crm-nova-atividade">
      <Selecao valor={tipo} onChange={setTipo} opcoes={TIPOS_ATIVIDADE} vazio={null} />
      <input
        className="input"
        value={titulo}
        onChange={e => setTitulo(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && salvar()}
        placeholder={tipo === 'nota' ? 'O que aconteceu?' : 'O que precisa ser feito?'}
        aria-label="Descrição da atividade"
      />
      {tipo === 'amostra' && <input className="input crm-kg" inputMode="numeric" value={kgAmostra} onChange={e => setKgAmostra(e.target.value)} placeholder="kg" aria-label="Peso da amostra" />}
      {tipo !== 'nota' && <input className="input crm-data" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} aria-label="Data" />}
      <Button variant="primary" icon="plus" label="Adicionar" onClick={salvar} />
    </div>
  );
}

function LinhaAtividade({atividade, mostrarOrigem}) {
  const {crm, crmSalvar, crmRemover, go} = useStore();
  const empresa = crm.empresas.find(e => e.id === atividade.empresaId);
  const negocio = crm.negocios.find(n => n.id === atividade.negocioId);
  const atrasada = !atividade.concluida && atividade.vencimento && atividade.vencimento < today();
  const nota = atividade.tipo === 'nota';
  return (
    <div className={`crm-atividade ${atividade.concluida ? 'feita' : ''} ${atrasada ? 'atrasada' : ''}`}>
      {nota ? (
        <span className="crm-nota-icone"><Icon name="layers" size={14} /></span>
      ) : (
        <input
          type="checkbox"
          aria-label={`Concluir ${atividade.titulo}`}
          checked={atividade.concluida}
          onChange={e => crmSalvar('atividades', {...atividade, concluida: e.target.checked, concluidaEm: e.target.checked ? today() : null})}
        />
      )}
      <div className="crm-atividade-texto">
        <b>{atividade.titulo}</b>
        <small>
          {TIPOS_ATIVIDADE[atividade.tipo]}
          {atividade.quantidadeKg ? ` · ${kg(atividade.quantidadeKg)}` : ''}
          {mostrarOrigem && negocio ? ` · ${negocio.titulo}` : ''}
          {mostrarOrigem && empresa ? ` · ${empresa.nome}` : ''}
        </small>
      </div>
      {mostrarOrigem && empresa && <button type="button" className="trail-link crm-abrir" onClick={() => go('crmempresas', {id: empresa.id})}>Abrir</button>}
      <span className={`crm-data-texto ${atrasada ? 'atrasada' : ''}`}>{date(atividade.vencimento, true)}</span>
      <button type="button" className="no-x" aria-label={`Remover ${atividade.titulo}`} onClick={() => crmRemover('atividades', atividade.id)}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

const ordemAtividades = (a, b) => Number(a.concluida) - Number(b.concluida) || (a.vencimento ?? '').localeCompare(b.vencimento ?? '');

/* ---------- Deal form ---------- */

function JanelaNegocio({inicial, onFechar}) {
  const {crm, crmSalvar, crmRemover, ativos, cadastro, cadastros} = useStore();
  const existente = crm.negocios.find(n => n.id === inicial.id);
  const [n, setN] = useState(() => ({
    quantidadeTexto: inicial.quantidadeKg ? String(inicial.quantidadeKg) : '',
    precoTexto: inicial.precoKg ? String(inicial.precoKg).replace('.', ',') : '',
    ...inicial
  }));
  const [erro, setErro] = useState(null);
  const [perdendo, setPerdendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const set = campo => valor => setN(atual => ({...atual, [campo]: valor}));
  const atual = {...n, quantidadeKg: parseKg(n.quantidadeTexto), precoKg: numero(n.precoTexto)};
  const empresa = crm.empresas.find(e => e.id === n.empresaId);
  const contatos = crm.contatos.filter(c => c.empresaId === n.empresaId);
  const atividades = crm.atividades.filter(a => a.negocioId === n.id).sort(ordemAtividades);

  const dados = () => {
    const {quantidadeTexto: _q, precoTexto: _p, ...limpo} = atual;
    return {...limpo, titulo: limpo.titulo.trim(), contatoId: limpo.contatoId || null, material: limpo.material || null, previsao: limpo.previsao || null, observacoes: vazioParaNulo(limpo.observacoes)};
  };
  const salvar = extra => {
    if (!n.titulo?.trim()) return setErro('Informe o título do negócio.');
    if (!n.empresaId) return setErro('Escolha a empresa.');
    crmSalvar('negocios', {...dados(), ...extra});
    onFechar();
  };
  // Winning a deal makes the company a plant client, so its lots and shipments connect from here on.
  const ganhar = () => {
    if (!n.titulo?.trim() || !n.empresaId) return salvar();
    let cliente = empresa.clientePlanta;
    if (!cliente) {
      cliente = empresa.nome.trim().toUpperCase();
      if (!cadastros.clientes.some(c => c.nome === cliente)) cadastro('clientes', 'add', cliente);
    }
    crmSalvar('empresas', {...empresa, clientePlanta: cliente, situacao: 'cliente'});
    salvar({situacao: 'ganho', fechadoEm: today(), motivoPerda: null});
  };

  return (
    <Janela titulo={existente ? n.titulo || 'Negócio' : 'Novo negócio'} onFechar={onFechar} largura={760}>
      {existente && n.situacao !== 'aberto' && (
        <div className={`crm-faixa ${n.situacao}`}>
          {n.situacao === 'ganho' ? 'Negócio ganho' : `Negócio perdido${n.motivoPerda ? `: ${n.motivoPerda}` : ''}`} em {date(n.fechadoEm, true)}
          <Button size="sm" label="Reabrir" onClick={() => salvar({situacao: 'aberto', fechadoEm: null, motivoPerda: null})} />
        </div>
      )}
      <div className="fields">
        <Campo rotulo="Título" largo>
          <input className="input" value={n.titulo ?? ''} onChange={e => set('titulo')(e.target.value)} placeholder="Ex.: ABS moído, 5 t por mês" autoFocus={!existente} />
        </Campo>
        <Campo rotulo="Empresa">
          <Selecao valor={n.empresaId} onChange={v => setN(a => ({...a, empresaId: v, contatoId: null}))} opcoes={Object.fromEntries([...crm.empresas].sort((a, b) => a.nome.localeCompare(b.nome)).map(e => [e.id, e.nome]))} />
        </Campo>
        <Campo rotulo="Contato">
          <Selecao valor={n.contatoId} onChange={set('contatoId')} opcoes={Object.fromEntries(contatos.map(c => [c.id, c.nome]))} vazio="Sem contato" />
        </Campo>
        <Campo rotulo="Tipo">
          <Selecao valor={n.tipo} onChange={set('tipo')} opcoes={TIPOS_NEGOCIO} vazio={null} />
        </Campo>
        <Campo rotulo="Etapa">
          <Selecao valor={n.etapaId} onChange={set('etapaId')} opcoes={Object.fromEntries(crm.etapas.map(e => [e.id, `${e.nome} (${e.probabilidade}%)`]))} vazio={null} />
        </Campo>
        <Campo rotulo="Material">
          <Selecao valor={n.material} onChange={set('material')} opcoes={Object.fromEntries([...ativos('materiais')].sort().map(m => [m, title(m)]))} />
        </Campo>
        <Campo rotulo="Quantidade (kg)">
          <input className="input" inputMode="numeric" value={n.quantidadeTexto} onChange={e => set('quantidadeTexto')(e.target.value)} placeholder="0" />
        </Campo>
        <Campo rotulo="Preço por kg (R$)">
          <input className="input" inputMode="decimal" value={n.precoTexto} onChange={e => set('precoTexto')(e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Fechamento previsto">
          <input className="input" type="date" value={n.previsao ?? ''} onChange={e => set('previsao')(e.target.value)} />
        </Campo>
        <Campo rotulo="Recorrência">
          <Selecao valor={n.recorrencia} onChange={set('recorrencia')} opcoes={{unica: 'Compra única', mensal: 'Mensal'}} vazio={null} />
        </Campo>
        <div className="field crm-total">
          <span>Valor do negócio{n.recorrencia === 'mensal' ? ' por mês' : ''}</span>
          <b>{brl(valorDe(atual))}</b>
        </div>
        <Campo rotulo="Observações" largo>
          <textarea className="input" value={n.observacoes ?? ''} onChange={e => set('observacoes')(e.target.value)} placeholder="Especificação, cor, granulometria, condições…" />
        </Campo>
      </div>

      <p className="label crm-sub">O que a planta tem para este negócio</p>
      <ViabilidadeDaPlanta negocio={atual} />

      {existente && (
        <>
          <p className="label crm-sub">Atividades</p>
          <NovaAtividade empresaId={n.empresaId} negocioId={n.id} />
          <div className="crm-atividades">
            {atividades.map(a => (
              <LinhaAtividade key={a.id} atividade={a} />
            ))}
            {!atividades.length && <p className="crm-alerta">Sem próximo passo definido para este negócio.</p>}
          </div>
        </>
      )}

      {perdendo && (
        <div className="crm-perda">
          <Campo rotulo="Por que foi perdido?">
            <Selecao valor={motivo} onChange={setMotivo} opcoes={MOTIVOS_PERDA} />
          </Campo>
          <Button variant="danger-solido" label="Confirmar perda" disabled={!motivo} onClick={() => salvar({situacao: 'perdido', fechadoEm: today(), motivoPerda: motivo})} />
          <Button label="Cancelar" onClick={() => setPerdendo(false)} />
        </div>
      )}

      {erro && <p className="wiz-err" style={{marginTop: 10}}>{erro}</p>}
      <div className="crm-rodape">
        <Button variant="primary" icon="check" label="Salvar" onClick={() => salvar()} />
        {n.situacao === 'aberto' && existente && <Button className="crm-ganhar" icon="check" label="Marcar como ganho" onClick={ganhar} />}
        {n.situacao === 'aberto' && existente && !perdendo && <Button variant="danger" label="Marcar como perdido" onClick={() => setPerdendo(true)} />}
        <span className="run-espaco" />
        {existente && (
          <Remover
            pergunta="Remover o negócio e as atividades dele?"
            onConfirmar={() => {
              crmRemover('negocios', n.id);
              onFechar();
            }}
          />
        )}
      </div>
    </Janela>
  );
}

const novoNegocio = (etapaId, empresaId) => ({
  id: crypto.randomUUID(),
  titulo: '',
  empresaId: empresaId ?? null,
  contatoId: null,
  etapaId,
  tipo: 'venda',
  material: null,
  quantidadeKg: null,
  precoKg: null,
  recorrencia: 'unica',
  previsao: null,
  situacao: 'aberto',
  motivoPerda: null,
  fechadoEm: null,
  observacoes: null
});

/* ---------- Pipeline ---------- */

const PASSOS = {
  atrasada: {rotulo: 'Atrasada', cor: 'var(--stop)'},
  hoje: {rotulo: 'Hoje', cor: 'var(--ok)'},
  futura: {rotulo: 'Agendada', cor: 'var(--subtle)'},
  nenhum: {rotulo: 'Sem próximo passo', cor: 'var(--ready)'}
};

function CartaoNegocio({negocio, onAbrir}) {
  const {crm} = useStore();
  const empresa = crm.empresas.find(e => e.id === negocio.empresaId);
  const passo = proximoPasso(negocio, crm.atividades);
  return (
    <button
      type="button"
      className="crm-cartao"
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', negocio.id)}
      onClick={() => onAbrir(negocio)}
    >
      <b>{negocio.titulo}</b>
      <span className="crm-cartao-empresa">{empresa?.nome}</span>
      <span className="crm-cartao-linha">
        <b className="mono">{brl(valorDe(negocio))}</b>
        {negocio.quantidadeKg ? <span>{kg(negocio.quantidadeKg)}</span> : null}
      </span>
      {negocio.material && <span className="crm-cartao-mat">{title(negocio.material)}</span>}
      <span className="crm-passo" style={{'--c': PASSOS[passo.estado].cor}}>
        <i /> {PASSOS[passo.estado].rotulo}
        {passo.atividade?.vencimento ? ` · ${date(passo.atividade.vencimento)}` : ''}
      </span>
    </button>
  );
}

export function CrmFunil() {
  const {crm, crmSalvar} = useStore();
  const [aberto, setAberto] = useState(null);
  const [tipo, setTipo] = useState('');
  const [sobre, setSobre] = useState(null);
  const abertos = crm.negocios.filter(n => n.situacao === 'aberto' && (!tipo || n.tipo === tipo));
  const total = abertos.reduce((s, n) => s + valorDe(n), 0);
  const ponderado = abertos.reduce((s, n) => s + ponderadoDe(n, crm.etapas), 0);
  const soltar = (e, etapaId) => {
    e.preventDefault();
    setSobre(null);
    const negocio = crm.negocios.find(n => n.id === e.dataTransfer.getData('text/plain'));
    if (negocio && negocio.etapaId !== etapaId) crmSalvar('negocios', {...negocio, etapaId});
  };
  return (
    <main className="page crm-pagina">
      <div className="page-head">
        <div>
          <h1 className="page-title">Funil de vendas</h1>
          <p className="page-sub">
            {abertos.length} negócios abertos · {brl(total)} · previsão ponderada {brl(ponderado)}
          </p>
        </div>
        <div className="page-actions">
          <div style={{width: 200}}>
            <Selecao valor={tipo} onChange={setTipo} opcoes={TIPOS_NEGOCIO} vazio="Todos os tipos" />
          </div>
          <Button variant="primary" icon="plus" label="Novo negócio" onClick={() => setAberto(novoNegocio(crm.etapas[0]?.id))} />
        </div>
      </div>
      {!crm.empresas.length && (
        <div className="sem-rota">
          <b>Comece pelas empresas.</b> Cadastre os prospects ou traga os clientes da planta em <i>Empresas</i>, depois crie os negócios.
        </div>
      )}
      <section className="crm-funil">
        {crm.etapas.map(etapa => {
          const lista = abertos.filter(n => n.etapaId === etapa.id);
          return (
            <div
              key={etapa.id}
              className={`crm-coluna ${sobre === etapa.id ? 'sobre' : ''}`}
              onDragOver={e => {
                e.preventDefault();
                setSobre(etapa.id);
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={e => soltar(e, etapa.id)}
            >
              <header>
                <b>{etapa.nome}</b>
                <small>{etapa.probabilidade}%</small>
                <span>{lista.length} · {brl(lista.reduce((s, n) => s + valorDe(n), 0))}</span>
              </header>
              <div className="crm-cartoes">
                {lista.map(n => (
                  <CartaoNegocio key={n.id} negocio={n} onAbrir={setAberto} />
                ))}
                <button type="button" className="crm-novo" onClick={() => setAberto(novoNegocio(etapa.id))}>
                  <Icon name="plus" size={14} /> Negócio
                </button>
              </div>
            </div>
          );
        })}
      </section>
      {aberto && <JanelaNegocio key={aberto.id} inicial={aberto} onFechar={() => setAberto(null)} />}
    </main>
  );
}

/* ---------- Companies ---------- */

const novaEmpresa = () => ({
  id: crypto.randomUUID(),
  nome: '',
  cnpj: null,
  segmento: null,
  porte: null,
  relacao: null,
  situacao: 'lead',
  cidade: null,
  uf: null,
  telefone: null,
  email: null,
  site: null,
  origem: 'Prospecção ativa',
  materiais: [],
  volumeMensalKg: null,
  clientePlanta: null,
  observacoes: null
});

function JanelaEmpresa({inicial, onFechar, onCriada}) {
  const {crm, crmSalvar, ativos} = useStore();
  const [e, setE] = useState(() => ({...inicial, volumeTexto: inicial.volumeMensalKg ? String(inicial.volumeMensalKg) : ''}));
  const [erro, setErro] = useState(null);
  const set = campo => valor => setE(a => ({...a, [campo]: valor}));
  const entrada = campo => ev => set(campo)(ev.target.value);
  const alternarMaterial = m => set('materiais')(e.materiais.includes(m) ? e.materiais.filter(x => x !== m) : [...e.materiais, m]);
  const salvar = () => {
    const nome = e.nome.trim();
    if (!nome) return setErro('Informe o nome da empresa.');
    const cnpj = (e.cnpj ?? '').replace(/\D/g, '');
    if (cnpj && crm.empresas.some(o => o.id !== e.id && o.cnpj === cnpj)) return setErro('Já existe uma empresa com esse CNPJ.');
    const {volumeTexto, ...limpa} = e;
    const item = {
      ...limpa,
      nome,
      cnpj: cnpj || null,
      uf: vazioParaNulo(e.uf)?.toUpperCase() ?? null,
      volumeMensalKg: parseKg(volumeTexto),
      relacao: e.relacao || null,
      segmento: e.segmento || null,
      porte: e.porte || null,
      origem: e.origem || null,
      cidade: vazioParaNulo(e.cidade),
      telefone: vazioParaNulo(e.telefone),
      email: vazioParaNulo(e.email),
      site: vazioParaNulo(e.site),
      observacoes: vazioParaNulo(e.observacoes)
    };
    crmSalvar('empresas', item);
    onCriada?.(item);
    onFechar();
  };
  return (
    <Janela titulo={inicial.nome ? `Editar ${inicial.nome}` : 'Nova empresa'} onFechar={onFechar} largura={720}>
      <div className="fields">
        <Campo rotulo="Nome da empresa" largo>
          <input className="input" value={e.nome} onChange={entrada('nome')} autoFocus />
        </Campo>
        <Campo rotulo="CNPJ"><input className="input" value={e.cnpj ?? ''} onChange={entrada('cnpj')} inputMode="numeric" /></Campo>
        <Campo rotulo="Situação"><Selecao valor={e.situacao} onChange={set('situacao')} opcoes={SITUACOES_EMPRESA} vazio={null} /></Campo>
        <Campo rotulo="Segmento"><Selecao valor={e.segmento} onChange={set('segmento')} opcoes={SEGMENTOS} /></Campo>
        <Campo rotulo="Porte"><Selecao valor={e.porte} onChange={set('porte')} opcoes={PORTES} /></Campo>
        <Campo rotulo="Relação com a planta"><Selecao valor={e.relacao} onChange={set('relacao')} opcoes={RELACOES} /></Campo>
        <Campo rotulo="Origem do contato"><Selecao valor={e.origem} onChange={set('origem')} opcoes={ORIGENS} /></Campo>
        <Campo rotulo="Cidade"><input className="input" value={e.cidade ?? ''} onChange={entrada('cidade')} /></Campo>
        <Campo rotulo="UF"><input className="input" value={e.uf ?? ''} onChange={entrada('uf')} maxLength={2} /></Campo>
        <Campo rotulo="Telefone"><input className="input" value={e.telefone ?? ''} onChange={entrada('telefone')} inputMode="tel" /></Campo>
        <Campo rotulo="E-mail"><input className="input" type="email" value={e.email ?? ''} onChange={entrada('email')} /></Campo>
        <Campo rotulo="Site"><input className="input" value={e.site ?? ''} onChange={entrada('site')} /></Campo>
        <Campo rotulo="Volume mensal estimado (kg)"><input className="input" inputMode="numeric" value={e.volumeTexto} onChange={entrada('volumeTexto')} /></Campo>
        <div className="field wide">
          <span>Materiais de interesse ({e.materiais.length})</span>
          <div className="crm-materiais">
            {[...ativos('materiais')].sort().map(m => (
              <label key={m} className="check mat-opcao">
                <input type="checkbox" checked={e.materiais.includes(m)} onChange={() => alternarMaterial(m)} />
                <span className="cut">{title(m)}</span>
              </label>
            ))}
          </div>
        </div>
        <Campo rotulo="Observações" largo><textarea className="input" value={e.observacoes ?? ''} onChange={entrada('observacoes')} /></Campo>
      </div>
      {erro && <p className="wiz-err" style={{marginTop: 10}}>{erro}</p>}
      <div className="crm-rodape">
        <Button variant="primary" icon="check" label="Salvar empresa" onClick={salvar} />
        <Button variant="ghost" label="Cancelar" onClick={onFechar} />
      </div>
    </Janela>
  );
}

function Contatos({empresa}) {
  const {crm, crmSalvar, crmRemover} = useStore();
  const [novo, setNovo] = useState({nome: '', cargo: '', telefone: '', email: ''});
  const contatos = crm.contatos.filter(c => c.empresaId === empresa.id);
  const adicionar = () => {
    if (!novo.nome.trim()) return;
    crmSalvar('contatos', {
      id: crypto.randomUUID(),
      empresaId: empresa.id,
      nome: novo.nome.trim(),
      cargo: vazioParaNulo(novo.cargo),
      telefone: vazioParaNulo(novo.telefone),
      email: vazioParaNulo(novo.email),
      principal: !contatos.length
    });
    setNovo({nome: '', cargo: '', telefone: '', email: ''});
  };
  const campo = (chave, rotulo) => (
    <input className="input" value={novo[chave]} placeholder={rotulo} aria-label={rotulo} onChange={e => setNovo(a => ({...a, [chave]: e.target.value}))} onKeyDown={e => e.key === 'Enter' && adicionar()} />
  );
  return (
    <section className="panel">
      <SectionHeader title={`Contatos (${contatos.length})`} />
      <div className="crm-contatos">
        {contatos.map(c => (
          <div key={c.id} className="crm-contato">
            <div>
              <b>{c.nome}</b>
              {c.principal && <span className="tag">principal</span>}
              <small>{[c.cargo, c.telefone, c.email].filter(Boolean).join(' · ') || 'Sem dados de contato'}</small>
            </div>
            <button type="button" className="no-x" aria-label={`Remover ${c.nome}`} onClick={() => crmRemover('contatos', c.id)}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="crm-novo-contato">
        {campo('nome', 'Nome')}
        {campo('cargo', 'Cargo')}
        {campo('telefone', 'Telefone')}
        {campo('email', 'E-mail')}
        <Button icon="plus" label="Adicionar" onClick={adicionar} />
      </div>
    </section>
  );
}

function EmpresaDetalhe({id, onVoltar}) {
  const {crm, crmRemover} = useStore();
  const empresa = crm.empresas.find(e => e.id === id);
  const [editando, setEditando] = useState(false);
  const [negocio, setNegocio] = useState(null);
  if (!empresa) return <main className="page"><div className="empty">Empresa não encontrada.</div></main>;
  const negocios = crm.negocios.filter(n => n.empresaId === id);
  const atividades = crm.atividades.filter(a => a.empresaId === id).sort(ordemAtividades);
  const ganhos = negocios.filter(n => n.situacao === 'ganho').reduce((s, n) => s + valorDe(n), 0);
  const abertos = negocios.filter(n => n.situacao === 'aberto').reduce((s, n) => s + valorDe(n), 0);
  const ficha = [
    ['CNPJ', empresa.cnpj],
    ['Segmento', empresa.segmento],
    ['Porte', empresa.porte],
    ['Relação', RELACOES[empresa.relacao]],
    ['Origem', empresa.origem],
    ['Local', [empresa.cidade, empresa.uf].filter(Boolean).join(' / ')],
    ['Telefone', empresa.telefone],
    ['E-mail', empresa.email],
    ['Site', empresa.site],
    ['Volume mensal', empresa.volumeMensalKg ? kg(empresa.volumeMensalKg) : null]
  ];
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <button type="button" className="trail-link" onClick={onVoltar}>← Empresas</button>
          <h1 className="page-title">{empresa.nome}</h1>
          <p className="page-sub">
            {SITUACOES_EMPRESA[empresa.situacao]} · {negocios.length} negócios · {brl(abertos)} em aberto · {brl(ganhos)} ganhos
          </p>
        </div>
        <div className="page-actions">
          <Button icon="plus" label="Novo negócio" onClick={() => setNegocio(novoNegocio(crm.etapas[0]?.id, id))} />
          <Button label="Editar" onClick={() => setEditando(true)} />
          <Remover pergunta="Remover a empresa, os contatos e os negócios?" onConfirmar={() => { crmRemover('empresas', id); onVoltar(); }} />
        </div>
      </div>
      <div className="crm-colunas">
        <div className="crm-col">
          <section className="panel">
            <SectionHeader title="Dados" />
            <div className="facts mapa-fatos">
              {ficha.map(([rotulo, valor]) => (
                <div key={rotulo} className="fact"><span>{rotulo}</span><b>{valor || '—'}</b></div>
              ))}
            </div>
            {empresa.materiais.length > 0 && (
              <>
                <p className="label crm-sub">Materiais de interesse</p>
                <div className="rota-words" style={{marginTop: 0}}>
                  {empresa.materiais.map(m => <span key={m} className="tag" style={{textTransform: 'none'}}>{title(m)}</span>)}
                </div>
              </>
            )}
            {empresa.observacoes && <p className="page-sub" style={{marginTop: 10}}>{empresa.observacoes}</p>}
          </section>
          <PainelDaPlanta empresa={empresa} />
        </div>
        <div className="crm-col">
          <Contatos empresa={empresa} />
          <section className="panel">
            <SectionHeader title={`Negócios (${negocios.length})`} />
            <div className="crm-contatos">
              {negocios.map(n => (
                <button key={n.id} type="button" className="crm-contato crm-negocio-linha" onClick={() => setNegocio(n)}>
                  <div>
                    <b>{n.titulo}</b>
                    <small>{TIPOS_NEGOCIO[n.tipo]} · {n.situacao === 'aberto' ? crm.etapas.find(e => e.id === n.etapaId)?.nome : n.situacao === 'ganho' ? 'Ganho' : 'Perdido'}</small>
                  </div>
                  <b className="mono">{brl(valorDe(n))}</b>
                </button>
              ))}
              {!negocios.length && <p className="page-sub">Nenhum negócio ainda.</p>}
            </div>
          </section>
          <section className="panel">
            <SectionHeader title="Atividades" />
            <NovaAtividade empresaId={id} />
            <div className="crm-atividades">
              {atividades.map(a => <LinhaAtividade key={a.id} atividade={a} />)}
              {!atividades.length && <p className="crm-alerta">Nenhuma atividade. Qual é o próximo contato?</p>}
            </div>
          </section>
        </div>
      </div>
      {editando && <JanelaEmpresa inicial={empresa} onFechar={() => setEditando(false)} />}
      {negocio && <JanelaNegocio key={negocio.id} inicial={negocio} onFechar={() => setNegocio(null)} />}
    </main>
  );
}

export function CrmEmpresas({initial}) {
  const {crm, cadastros, lotes, crmSalvar, notify, go} = useStore();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [segmento, setSegmento] = useState('');
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState(initial?.id ?? null);

  const vinculados = new Set(crm.empresas.map(e => e.clientePlanta).filter(Boolean));
  const semEmpresa = cadastros.clientes.filter(c => c.ativo && !vinculados.has(c.nome));
  const trazerClientes = () => {
    for (const c of semEmpresa) {
      crmSalvar('empresas', {
        ...novaEmpresa(),
        nome: title(c.nome),
        situacao: 'cliente',
        origem: 'Base da planta',
        clientePlanta: c.nome,
        materiais: [...new Set(lotes.filter(l => l.cliente === c.nome).flatMap(l => l.materiais))]
      });
    }
    notify({status: 'Clientes importados', title: `${semEmpresa.length} empresas criadas`, detail: 'Com o histórico da planta vinculado', icon: 'check'});
  };

  if (aberta) return <EmpresaDetalhe key={aberta} id={aberta} onVoltar={() => setAberta(null)} />;

  const q = busca.trim().toUpperCase();
  const lista = crm.empresas
    .filter(e => !q || e.nome.toUpperCase().includes(q) || e.cnpj?.includes(q.replace(/\D/g, '') || q) || e.cidade?.toUpperCase().includes(q))
    .filter(e => !situacao || e.situacao === situacao)
    .filter(e => !segmento || e.segmento === segmento)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Empresas</h1>
          <p className="page-sub">Prospects, fornecedores e clientes, com o histórico da planta quando houver.</p>
        </div>
        <div className="page-actions">
          {semEmpresa.length > 0 && <Button icon="refresh" label={`Trazer clientes da planta (${semEmpresa.length})`} onClick={trazerClientes} />}
          <Button variant="primary" icon="plus" label="Nova empresa" onClick={() => setNova(true)} />
        </div>
      </div>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CNPJ ou cidade" aria-label="Buscar empresa" />
        </label>
        <div style={{width: 180}}><Selecao valor={situacao} onChange={setSituacao} opcoes={SITUACOES_EMPRESA} vazio="Todas as situações" /></div>
        <div style={{width: 200}}><Selecao valor={segmento} onChange={setSegmento} opcoes={SEGMENTOS} vazio="Todos os segmentos" /></div>
      </div>
      <div className="dtable-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Situação</th>
              <th>Segmento</th>
              <th>Local</th>
              <th>Contato principal</th>
              <th className="n">Em aberto</th>
              <th>Planta</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(e => {
              const contato = crm.contatos.find(c => c.empresaId === e.id && c.principal) ?? crm.contatos.find(c => c.empresaId === e.id);
              const aberto = crm.negocios.filter(n => n.empresaId === e.id && n.situacao === 'aberto').reduce((s, n) => s + valorDe(n), 0);
              return (
                <tr key={e.id} onClick={() => setAberta(e.id)}>
                  <td className="ell" style={{fontWeight: 500}}>{e.nome}</td>
                  <td><span className={`crm-situacao ${e.situacao}`}>{SITUACOES_EMPRESA[e.situacao]}</span></td>
                  <td className="ell">{e.segmento ?? '—'}</td>
                  <td>{[e.cidade, e.uf].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="ell">{contato?.nome ?? '—'}</td>
                  <td className="n">{aberto ? brl(aberto) : '—'}</td>
                  <td>{e.clientePlanta ? <span className="tag" style={{textTransform: 'none', margin: 0}}>vinculada</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lista.length && <div className="empty">{crm.empresas.length ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada ainda.'}</div>}
      </div>
      {nova && <JanelaEmpresa inicial={novaEmpresa()} onFechar={() => setNova(false)} onCriada={e => setAberta(e.id)} />}
    </main>
  );
}

/* ---------- Activities ---------- */

export function CrmAtividades() {
  const {crm} = useStore();
  const hoje = today();
  const abertas = crm.atividades.filter(a => !a.concluida).sort(ordemAtividades);
  const grupos = [
    {titulo: 'Atrasadas', lista: abertas.filter(a => a.vencimento && a.vencimento < hoje)},
    {titulo: 'Hoje', lista: abertas.filter(a => a.vencimento === hoje)},
    {titulo: 'Próximas', lista: abertas.filter(a => a.vencimento > hoje)},
    {titulo: 'Sem data', lista: abertas.filter(a => !a.vencimento)}
  ];
  const semPasso = crm.negocios.filter(n => n.situacao === 'aberto' && proximoPasso(n, crm.atividades).estado === 'nenhum');
  return (
    <main className="page">
      <div>
        <h1 className="page-title">Atividades</h1>
        <p className="page-sub">O que fazer hoje para os negócios andarem.</p>
      </div>
      {semPasso.length > 0 && (
        <div className="sem-rota">
          <b>{semPasso.length} {semPasso.length === 1 ? 'negócio sem' : 'negócios sem'} próximo passo:</b> {semPasso.slice(0, 5).map(n => n.titulo).join(', ')}
          {semPasso.length > 5 ? '…' : ''}
        </div>
      )}
      {grupos.filter(g => g.lista.length).map(g => (
        <section key={g.titulo}>
          <SectionHeader title={`${g.titulo} (${g.lista.length})`} />
          <div className="crm-atividades panel">
            {g.lista.map(a => <LinhaAtividade key={a.id} atividade={a} mostrarOrigem />)}
          </div>
        </section>
      ))}
      {!abertas.length && <div className="painel-empty panel">Nenhuma atividade em aberto.</div>}
    </main>
  );
}

/* ---------- Activity history ---------- */

const dataDoHistorico = a => a.concluidaEm ?? a.vencimento ?? '';

export function CrmHistorico() {
  const {crm, go} = useStore();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const realizadas = crm.atividades.filter(a => a.concluida);
  const q = busca.trim().toUpperCase();
  const lista = realizadas
    .map(a => ({
      ...a,
      data: dataDoHistorico(a),
      empresa: crm.empresas.find(e => e.id === a.empresaId),
      negocio: crm.negocios.find(n => n.id === a.negocioId)
    }))
    .filter(a => !tipo || a.tipo === tipo)
    .filter(a => !empresaId || a.empresaId === empresaId)
    .filter(a => !de || a.data >= de)
    .filter(a => !ate || a.data <= ate)
    .filter(a => !q || [a.titulo, a.descricao, a.empresa?.nome, a.negocio?.titulo].some(t => t?.toUpperCase().includes(q)))
    .sort((a, b) => b.data.localeCompare(a.data));

  const empresas = Object.fromEntries(
    [...crm.empresas]
      .filter(e => realizadas.some(a => a.empresaId === e.id))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(e => [e.id, e.nome])
  );

  return (
    <main className="page">
      <div>
        <h1 className="page-title">Histórico de atividades</h1>
        <p className="page-sub">
          Tudo que já foi feito pelo comercial: {realizadas.length} {realizadas.length === 1 ? 'registro' : 'registros'}.
        </p>
      </div>
      <div className="toolbar crm-filtros">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar atividade, empresa ou negócio" aria-label="Buscar no histórico" />
        </label>
        <div className="crm-filtro"><Selecao valor={tipo} onChange={setTipo} opcoes={TIPOS_ATIVIDADE} vazio="Todos os tipos" /></div>
        <div className="crm-filtro"><Selecao valor={empresaId} onChange={setEmpresaId} opcoes={empresas} vazio="Todas as empresas" /></div>
        <label className="crm-periodo">
          <span>De</span>
          <input className="input" type="date" value={de} onChange={e => setDe(e.target.value)} />
        </label>
        <label className="crm-periodo">
          <span>Até</span>
          <input className="input" type="date" value={ate} onChange={e => setAte(e.target.value)} />
        </label>
      </div>
      <div className="dtable-wrap">
        {lista.length > 0 && (
          <table className="dtable sem-hover">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Atividade</th>
                <th>Empresa</th>
                <th>Negócio</th>
                <th className="n">Peso</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(a => (
                <tr key={a.id}>
                  <td className="mono">{date(a.data, true)}</td>
                  <td>{TIPOS_ATIVIDADE[a.tipo]}</td>
                  <td className="crm-hist-texto">
                    <b>{a.titulo}</b>
                    {a.descricao && <small>{a.descricao}</small>}
                  </td>
                  <td>
                    {a.empresa ? (
                      <button type="button" className="trail-link" onClick={() => go('crmempresas', {id: a.empresa.id})}>
                        {a.empresa.nome}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="ell">{a.negocio?.titulo ?? '—'}</td>
                  <td className="n">{a.quantidadeKg ? kg(a.quantidadeKg) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!lista.length && (
          <div className="empty">{realizadas.length ? 'Nenhum registro com esses filtros.' : 'Nenhuma atividade concluída ainda. As anotações e as atividades marcadas como feitas aparecem aqui.'}</div>
        )}
      </div>
    </main>
  );
}

/* ---------- Indicators ---------- */

export function CrmIndicadores({onGo}) {
  const {crm, lotes, balances} = useStore();
  const abertos = crm.negocios.filter(n => n.situacao === 'aberto');
  const ganhos = crm.negocios.filter(n => n.situacao === 'ganho');
  const perdidos = crm.negocios.filter(n => n.situacao === 'perdido');
  const mes = today().slice(0, 7);
  const ganhosMes = ganhos.filter(n => n.fechadoEm?.startsWith(mes));
  const fechados = ganhos.length + perdidos.length;
  const atrasadas = crm.atividades.filter(a => !a.concluida && a.vencimento && a.vencimento < today()).length;
  const cells = [
    {label: 'Em aberto', value: brl(abertos.reduce((s, n) => s + valorDe(n), 0)), hint: `${abertos.length} negócios`},
    {label: 'Previsão ponderada', value: brl(abertos.reduce((s, n) => s + ponderadoDe(n, crm.etapas), 0)), hint: 'valor × chance da etapa', color: 'var(--run)'},
    {label: 'Ganho no mês', value: brl(ganhosMes.reduce((s, n) => s + valorDe(n), 0)), hint: `${ganhosMes.length} negócios`, color: 'var(--ok)'},
    {label: 'Taxa de conversão', value: fechados ? pct(ganhos.length / fechados).replace('+', '') : '—', hint: `${ganhos.length} ganhos de ${fechados} fechados`},
    {label: 'Atividades atrasadas', value: atrasadas, hint: 'precisam de retorno', color: atrasadas ? 'var(--stop)' : undefined}
  ];
  const porEtapa = crm.etapas.map(e => {
    const lista = abertos.filter(n => n.etapaId === e.id);
    return {...e, qtd: lista.length, valor: lista.reduce((s, n) => s + valorDe(n), 0)};
  });
  const maiorEtapa = Math.max(...porEtapa.map(e => e.valor), 1);
  const motivos = MOTIVOS_PERDA.map(m => ({motivo: m, qtd: perdidos.filter(n => n.motivoPerda === m).length})).filter(m => m.qtd);

  // Sales against the plant: what is being offered versus what is actually finished.
  const estoque = estoquePorMaterial({lotes, balances});
  const demanda = new Map();
  for (const n of abertos) {
    if (n.tipo !== 'venda' || !n.material) continue;
    demanda.set(n.material, (demanda.get(n.material) ?? 0) + (n.quantidadeKg ?? 0));
  }
  const materiais = [...new Set([...demanda.keys(), ...estoque.keys()])]
    .map(m => ({material: m, procura: demanda.get(m) ?? 0, estoque: estoque.get(m)?.kg ?? 0}))
    .sort((a, b) => b.procura - a.procura || b.estoque - a.estoque);

  const segmentos = {};
  for (const n of [...abertos, ...ganhos]) {
    const seg = crm.empresas.find(e => e.id === n.empresaId)?.segmento ?? 'Sem segmento';
    segmentos[seg] = (segmentos[seg] ?? 0) + valorDe(n);
  }
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Indicadores de vendas</h1>
          <p className="page-sub">O funil comercial e o que a planta tem para atender.</p>
        </div>
        <Button icon="filter" label="Abrir funil" onClick={() => onGo('crm')} />
      </div>
      <section className="kpi-strip">
        {cells.map(c => (
          <div key={c.label} className="kpi-cell" style={{'--c': c.color}}>
            <span>{c.label}</span>
            <b style={c.color ? {color: c.color, fontSize: 19} : {fontSize: 19}}>{c.value}</b>
            <small>{c.hint}</small>
          </div>
        ))}
      </section>
      <div className="painel-tops" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'}}>
        <section className="panel">
          <SectionHeader title="Valor por etapa" />
          <div className="hbars">
            {porEtapa.map(e => (
              <div key={e.id} className="hbar crm-hbar">
                <span className="hbar-lbl">{e.nome}</span>
                <div className="track"><div className="fill" style={{width: `${(e.valor / maiorEtapa) * 100}%`, background: 'var(--accent)'}} /></div>
                <span className="v">{brl(e.valor)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <SectionHeader title="Motivos de perda" />
          {motivos.length ? (
            <div className="crm-contatos">
              {motivos.map(m => (
                <div key={m.motivo} className="crm-contato"><span>{m.motivo}</span><b className="mono">{m.qtd}</b></div>
              ))}
            </div>
          ) : (
            <p className="page-sub">Nenhum negócio perdido.</p>
          )}
        </section>
        <section className="panel">
          <SectionHeader title="Valor por segmento" />
          {Object.keys(segmentos).length ? (
            <div className="crm-contatos">
              {Object.entries(segmentos).sort((a, b) => b[1] - a[1]).map(([seg, valor]) => (
                <div key={seg} className="crm-contato"><span>{seg}</span><b className="mono">{brl(valor)}</b></div>
              ))}
            </div>
          ) : (
            <p className="page-sub">Sem negócios ainda.</p>
          )}
        </section>
      </div>
      <section>
        <SectionHeader title="Procura × estoque da planta" />
        <div className="dtable-wrap">
          <table className="dtable sem-hover">
            <thead>
              <tr>
                <th>Material</th>
                <th className="n">Em negociação</th>
                <th className="n">Em estoque</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {materiais.map(m => (
                <tr key={m.material}>
                  <td style={{fontWeight: 500}}>{title(m.material)}</td>
                  <td className="n">{m.procura ? kg(m.procura) : '—'}</td>
                  <td className="n">{kg(m.estoque)}</td>
                  <td>
                    {!m.procura ? (
                      <span className="crm-situacao oferta">Estoque para oferecer</span>
                    ) : m.estoque >= m.procura ? (
                      <span className="crm-situacao cliente">Estoque atende</span>
                    ) : (
                      <span className="crm-situacao falta">Faltam {kg(m.procura - m.estoque)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!materiais.length && <div className="empty">Sem estoque nem negócios de venda.</div>}
        </div>
      </section>
    </main>
  );
}
