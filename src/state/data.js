// Domain constants, formatting and derived figures for lots and production orders.

export const STATUS = {
  'AGUARDANDO INICIO': {label: 'Aguardando início', short: 'Aguardando', color: 'var(--wait)'},
  'EM PROCESSO': {label: 'Em processo', short: 'Em processo', color: 'var(--run)', pulse: true},
  PARADO: {label: 'Parado', short: 'Parado', color: 'var(--stop)'},
  'A PRONTA ENTREGA': {label: 'Pronto para entrega', short: 'Pronto', color: 'var(--ready)'},
  'EM ESTOQUE': {label: 'Em estoque', short: 'Em estoque', color: 'var(--stock)'},
  ENTREGUE: {label: 'Entregue', short: 'Entregue', color: 'var(--ok)'},
  DEVOLVIDO: {label: 'Devolvido ao cliente', short: 'Devolvido', color: 'var(--subtle)'},
  HISTORICO: {label: 'Sem status', short: 'Sem status', color: 'var(--subtle)'}
};

export const BOARD = ['AGUARDANDO INICIO', 'EM PROCESSO', 'PARADO', 'A PRONTA ENTREGA'];

// The eleven production steps of the flowchart, in line order.
export const ETAPAS = [
  'SEPARAÇÃO TRIAGEM',
  'MOAGEM SHREDDER',
  'LIMPEZA VARREDURA',
  'LIMPEZA DENSIDADE',
  'MOAGEM FACAS',
  'SECAGEM',
  'DESCONTAMINADORA',
  'SEPARA COR',
  'SEPARA METAIS',
  'HOMOGENIZAÇÃO',
  'EXTRUSÃO'
];

// Sector names used on the shop floor, mapped onto the flowchart step they belong to.
export const SETOR_ETAPA = {
  'MOAGEM 500': 'MOAGEM FACAS',
  DENSIDADE: 'LIMPEZA DENSIDADE',
  'LAVAGEM DE GRÃO': 'LIMPEZA VARREDURA'
};

export const SETORES = [...ETAPAS, 'MOAGEM 500', 'LAVAGEM DE GRÃO', 'DENSIDADE'];
export const GALPOES = ['GALPÃO 01', 'GALPÃO 02', 'GALPÃO 03'];
export const COMPRAS = ['PRODUTO', 'BENEFICIAMENTO', 'RETRABALHO', 'DEVOLUÇÃO'];
export const EMBALAGENS = ['BIG BAG', 'SACARIA', 'CAÇAMBA', 'PALETE'];

// How one weighed unit is called for each kind of packaging.
const VOLUME = {'BIG BAG': ['Big bag', 'Big bags'], SACARIA: ['Saco', 'Sacos'], 'CAÇAMBA': ['Caçamba', 'Caçambas'], PALETE: ['Palete', 'Paletes']};
export const nomeVolume = (embalagem, n = 1) => (VOLUME[embalagem] ?? ['Volume', 'Volumes'])[n === 1 ? 0 : 1];
export const TIPOS = ['MOIDO', 'GRANULADO', 'PEÇAS'];
export const CORES = ['BRANCO', 'CINZA', 'COLORIDO', 'NATURAL', 'PRETO'];

export const slug = text =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

const ACRONYMS = new Set([
  'PP', 'PE', 'PS', 'PC', 'ABS', 'EVA', 'PEABD', 'PEBD', 'XLPE', 'PPS', 'JCS', 'EFL', 'KF', 'ARP', 'MGF', 'WP',
  'JS', 'NF', 'HIPS', 'PET', 'MMA', '01', '02', '03', 'II'
]);
const SMALL = new Set(['de', 'da', 'do', 'e', 'das', 'dos']);
// The spreadsheet is typed without accents; display words get them back.
const ACCENTS = {
  plastico: 'plástico', plasticos: 'plásticos', eletronico: 'eletrônico', eletronicos: 'eletrônicos',
  residuo: 'resíduo', residuos: 'resíduos', moido: 'moído', industria: 'indústria', acrilico: 'acrílico',
  inicio: 'início', separacao: 'separação', homogenizacao: 'homogenização', extrusao: 'extrusão',
  relogio: 'relógio', pecas: 'peças', devolucao: 'devolução', usuario: 'usuário', comercio: 'comércio',
  representacoes: 'representações', importacoes: 'importações', cacamba: 'caçamba', galpao: 'galpão'
};

export function title(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(/(\s+|\/|\+)/)
    .map((raw, i) => {
      const word = ACCENTS[raw] ?? raw;
      const up = word.toUpperCase();
      if (ACRONYMS.has(up)) return up;
      if (i > 0 && SMALL.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

export const hours = h => `${h.toLocaleString('pt-BR', {maximumFractionDigits: 1, minimumFractionDigits: 1})} h`;

const kgFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 0});
const tFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1, minimumFractionDigits: 1});
const pctFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero'});

export const kg = n => (n == null ? '—' : `${kgFormat.format(n)} kg`);
export const num = n => (n == null ? '—' : kgFormat.format(n));
export const tons = n => tFormat.format(n / 1000);
export const pct = n => (n == null ? '—' : `${pctFormat.format(n * 100)}%`);

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export function date(iso, withYear = false) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export const today = () => new Date().toLocaleDateString('sv-SE');

// Child lots (separations, mixes) carry their weight directly instead of scale weighings.
export const pesado = lote => lote.pesoEntrada ?? lote.bags.reduce((sum, b) => sum + b, 0);

// Our scale against the invoice: positive means more material arrived than invoiced.
export function divergencia(lote) {
  const total = pesado(lote);
  if (!lote.pesoNF || !total) return null;
  return {kg: total - lote.pesoNF, pct: (total - lote.pesoNF) / lote.pesoNF};
}

export const materialDe = lote => lote.materiais.join(' + ') || '—';
// Lots received before bags had their own material: every bag is of the lot's (first) material.
export const materialDoBag = (lote, i) => lote.bagsMateriais?.[i] ?? lote.materiais[0] ?? null;
export const bagsMisturados = lote => new Set(lote.bags.map((_, i) => materialDoBag(lote, i))).size > 1;

export function setorEtapa(setor) {
  return SETOR_ETAPA[setor] ?? setor;
}

export function nextLote(lotes) {
  const main = lotes.map(l => Number(l.lote)).filter(n => Number.isFinite(n) && n >= 3000);
  return String(Math.max(3000, ...main) + 1);
}
