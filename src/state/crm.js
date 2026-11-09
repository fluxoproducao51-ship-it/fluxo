// Sales figures and what the CRM reads from the plant.

import {materialDe, pesado, today} from './data.js';

export const TIPOS_NEGOCIO = {
  venda: 'Venda de material',
  compra: 'Compra de sucata',
  beneficiamento: 'Beneficiamento'
};
export const RELACOES = {comprador: 'Compra material', fornecedor: 'Fornece sucata', beneficiamento: 'Beneficiamento', ambos: 'Compra e fornece'};
export const SITUACOES_EMPRESA = {lead: 'Lead', qualificada: 'Qualificada', cliente: 'Cliente', inativa: 'Inativa'};
export const SEGMENTOS = [
  'Injeção plástica', 'Extrusão', 'Sopro', 'Autopeças', 'Eletroeletrônicos', 'Utilidades domésticas', 'Construção civil',
  'Embalagens', 'Reciclagem', 'Sucateiro / aparista', 'Outro'
];
export const PORTES = ['Micro', 'Pequena', 'Média', 'Grande'];
export const ORIGENS = ['Prospecção ativa', 'Indicação', 'Site', 'Feira ou evento', 'Base da planta', 'Outra'];
export const MOTIVOS_PERDA = ['Preço', 'Especificação do material', 'Prazo', 'Volume insuficiente', 'Escolheu concorrente', 'Sem retorno', 'Outro'];
export const TIPOS_ATIVIDADE = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
  amostra: 'Envio de amostra',
  tarefa: 'Tarefa',
  nota: 'Anotação'
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
