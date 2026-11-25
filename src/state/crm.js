// Sales figures and what the CRM reads from the plant.

import {materialDe, pesado, today} from './data.js';

export const TIPOS_NEGOCIO = {
  venda: 'Venda de material',
  compra: 'Compra de sucata',
  beneficiamento: 'Beneficiamento'
};
export const RELACOES = {comprador: 'Compra material', fornecedor: 'Fornece sucata', beneficiamento: 'Beneficiamento', ambos: 'Compra e fornece'};
export const SITUACOES_EMPRESA = {lead: 'Lead', qualificada: 'Qualificada', cliente: 'Cliente', inativa: 'Inativa'};
// Lists that end with "Outro": choosing it lets the user type any name.
export const SEGMENTOS = ['Injeção', 'Extrusão', 'Fornecedor de sucata'];
export const ORIGENS = ['Prospecção ativa', 'Indicação', 'Site', 'Feira ou evento', 'Base da planta'];
export const MOTIVOS_PERDA = ['Preço', 'Especificação do material', 'Prazo', 'Volume insuficiente', 'Escolheu concorrente', 'Sem retorno', 'Outro'];
export const TIPOS_ATIVIDADE = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
  amostra: 'Envio de amostra',
  proposta: 'Proposta enviada',
  tarefa: 'Tarefa',
  nota: 'Anotação'
};

// Each kind keeps its color wherever it shows (fixed order, validated). Notes are records of what
// happened, not things to do: the calendar hides them unless asked for.
export const CORES_TIPO = {
  ligacao: '#2a78d6',
  visita: '#eb6834',
  whatsapp: '#1baf7a',
  amostra: '#eda100',
  reuniao: '#e87ba4',
  proposta: '#008300',
  email: '#6250d6',
  tarefa: '#76808d',
  nota: '#a3abb5'
};

const reais = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: 0});
export const brl = valor => reais.format(valor ?? 0);

export const valorDe = negocio => (negocio.quantidadeKg ?? 0) * (negocio.precoKg ?? 0);

export function ponderadoDe(negocio, etapas) {
  const etapa = etapas.find(e => e.id === negocio.etapaId);
  return (valorDe(negocio) * (etapa?.probabilidade ?? 0)) / 100;
}

// The next open step of a deal, the way a salesperson scans a pipeline: late, today, later or none.
export function proximoPasso(negocio, atividades) {
  const abertas = atividades
    .filter(a => a.negocioId === negocio.id && !a.concluida && a.tipo !== 'nota')
    .sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999'));
  const proxima = abertas[0];
  if (!proxima) return {estado: 'nenhum'};
  const hoje = today();
  if (proxima.vencimento && proxima.vencimento < hoje) return {estado: 'atrasada', atividade: proxima};
  if (proxima.vencimento === hoje) return {estado: 'hoje', atividade: proxima};
  return {estado: 'futura', atividade: proxima};
}

// A company's history on the plant floor, through the client it is linked to.
export function plantaDoCliente(cliente, {lotes, balances, envios}) {
  if (!cliente) return null;
  const doCliente = lotes.filter(l => l.cliente === cliente);
  const saldo = id => balances.get(id);
  const usado = doCliente.reduce((s, l) => s + (saldo(l.lote)?.usado ?? 0), 0);
  const obtido = doCliente.reduce((s, l) => s + (saldo(l.lote)?.obtido ?? 0), 0);
  return {
    lotes: [...doCliente].sort((a, b) => b.data.localeCompare(a.data)),
    recebido: doCliente.reduce((s, l) => s + pesado(l), 0),
    emProcesso: doCliente.reduce((s, l) => s + (saldo(l.lote)?.pend ?? 0) + (saldo(l.lote)?.maquina ?? 0), 0),
    emEstoque: doCliente.reduce((s, l) => s + (saldo(l.lote)?.est ?? 0), 0),
    enviado: envios.filter(e => e.cliente === cliente).reduce((s, e) => s + e.peso, 0),
    rendimento: usado ? obtido / usado : null,
    materiais: [...new Set(doCliente.flatMap(l => l.materiais))]
  };
}

// Finished stock by material: what sales can actually promise today.
export function estoquePorMaterial({lotes, balances}) {
  const mapa = new Map();
  for (const l of lotes) {
    const est = balances.get(l.lote)?.est ?? 0;
    if (est <= 0) continue;
    const nome = materialDe(l);
    const item = mapa.get(nome) ?? {material: nome, kg: 0, lotes: []};
    item.kg += est;
    item.lotes.push({lote: l.lote, kg: est});
    mapa.set(nome, item);
  }
  return mapa;
}

// Machine hours a quantity needs, along the material's route, for machines with a known capacity.
export function tempoDeProducao(quantidade, rota, maquinas) {
  if (!quantidade || !rota?.etapas.length) return null;
  const capacidades = rota.etapas.map(nome => maquinas.find(m => m.nome === nome)?.capacidade);
  const conhecidas = capacidades.filter(Boolean);
  return {
    horas: conhecidas.reduce((s, c) => s + quantidade / c, 0),
    conhecidas: conhecidas.length,
    total: rota.etapas.length
  };
}

/* ---------- The funnel moving on its own ---------- */
// Each stage has one step. Concluding it (its own button, never an ordinary activity) records the
// activity and moves the deal to the next stage, with a note saying why. Dragging still works.

export const CONTATOS = {ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', visita: 'Visita', reuniao: 'Reunião'};
export const DIAS_PARADO = 15;
export const PASSOS_FUNIL = {
  prospeccao: {titulo: 'Primeiro contato feito', vai: 'qualificacao', contato: true},
  qualificacao: {titulo: 'Amostra enviada', vai: 'amostra', tipo: 'amostra', kg: true},
  amostra: {titulo: 'Proposta enviada', vai: 'proposta', tipo: 'proposta', valor: true},
  proposta: {titulo: 'Cliente respondeu a proposta', vai: 'negociacao', contato: true}
};

export const passoDaEtapa = n => (n.situacao === 'aberto' ? PASSOS_FUNIL[n.etapaId] ?? null : null);

// The step done and the deal one stage ahead. `tipo` is the contact channel for contact steps.
export function concluirPasso(crm, negocioId, {tipo, quantidadeKg} = {}) {
  const n = crm.negocios.find(x => x.id === negocioId);
  const passo = n && passoDaEtapa(n);
  const etapa = passo && crm.etapas.find(e => e.id === passo.vai);
  if (!etapa) return crm;
  const base = {vencimento: today(), concluida: true, concluidaEm: today(), empresaId: n.empresaId, negocioId: n.id, lote: null, criadoEm: new Date().toISOString()};
  const feito = {...base, id: crypto.randomUUID(), tipo: passo.tipo ?? tipo ?? 'ligacao', titulo: passo.titulo, descricao: null, quantidadeKg: passo.kg ? quantidadeKg ?? null : null};
  const nota = {...base, id: crypto.randomUUID(), tipo: 'nota', titulo: `Avançou para ${etapa.nome}`, descricao: `passo concluído: ${passo.titulo.toLowerCase()}`, quantidadeKg: null};
  return {
    ...crm,
    negocios: crm.negocios.map(x => (x.id === n.id ? {...x, etapaId: etapa.id} : x)),
    atividades: [...crm.atividades, feito, nota]
  };
}

// Days since anything happened on the deal; null when nothing is dated yet.
export function diasSemAtividade(n, atividades) {
  const datas = [n.criadoEm?.slice(0, 10), ...atividades.filter(a => a.negocioId === n.id).flatMap(a => [a.concluidaEm, a.criadoEm?.slice(0, 10)])].filter(Boolean);
  if (!datas.length) return null;
  const ultima = datas.sort().pop();
  return Math.round((Date.parse(today()) - Date.parse(ultima)) / 86400000);
}

// In negotiation, the plant itself may show the deal closed: a shipment to that client (sale) or a
// lot received from it (scrap purchase, processing). The salesperson confirms; nothing closes alone.
export function sinalDeGanho(n, {empresas, lotes, envios}) {
  if (n.situacao !== 'aberto' || n.etapaId !== 'negociacao') return null;
  const cliente = empresas.find(e => e.id === n.empresaId)?.clientePlanta;
  if (!cliente) return null;
  const desde = n.criadoEm?.slice(0, 10) ?? '0000-00-00';
  const temMaterial = l => !n.material || (l?.materiais ?? []).includes(n.material) || (l?.bagsMateriais ?? []).includes(n.material);
  if (n.tipo === 'venda') {
    const envio = envios.filter(e => e.cliente === cliente && e.data >= desde && temMaterial(lotes.find(l => l.lote === e.lote))).sort((a, b) => b.data.localeCompare(a.data))[0];
    return envio ? `A planta enviou ${envio.peso.toLocaleString('pt-BR')} kg do lote ${envio.lote} para este cliente` : null;
  }
  const lote = lotes.filter(l => l.cliente === cliente && l.data >= desde && temMaterial(l)).sort((a, b) => b.data.localeCompare(a.data))[0];
  return lote ? `A planta recebeu o lote ${lote.lote} deste cliente` : null;
}
