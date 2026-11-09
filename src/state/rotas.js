// Production routes: the ordered machines a lot passes through. Each material is linked to one
// route (`materiais`); keywords only cover names nobody linked yet. The route is copied onto the
// lot at receiving, so later edits to the template don't rewrite lots already on the floor.

export const ROTAS_PADRAO = [
  {
    id: 'rota-granulado',
    nome: 'GRANULADO',
    palavras: ['GRANULADO', 'RETRABALHO'],
    etapas: ['SEPARA COR', 'HOMOGENIZAÇÃO'],
    ativo: true
  },
  {
    id: 'rota-varredura',
    nome: 'VARREDURA',
    palavras: ['VARREDURA', 'BORRA'],
    etapas: ['LAVAGEM DE GRÃO', 'SECAGEM', 'SEPARA COR'],
    ativo: true
  },
  {
    id: 'rota-eletronico',
    nome: 'ELETRÔNICO',
    palavras: ['ELETRONICO', 'PLACA', 'RELOGIO'],
    etapas: ['SEPARAÇÃO TRIAGEM', 'MOAGEM SHREDDER', 'MOAGEM 500', 'DENSIDADE', 'SEPARA METAIS', 'DESCONTAMINADORA'],
    ativo: true
  },
  {
    id: 'rota-sucata',
    nome: 'SUCATA / RESÍDUO DE PLÁSTICO',
    palavras: ['SUCATA', 'RESIDUO', 'BRUTO', 'DIVERSOS', 'MISTO', 'PLASTICO', 'ABS', 'PS', 'PP', 'PE', 'PC', 'EVA', 'ACRILICO'],
    etapas: ['SEPARAÇÃO TRIAGEM', 'MOAGEM SHREDDER', 'MOAGEM 500', 'DENSIDADE', 'DESCONTAMINADORA'],
    ativo: true
  }
];

const plain = text =>
  (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

// The route the material is linked to. Otherwise, the active route with the most specific keyword
// in the material name (the longest match), so "ABS GRANULADO" picks the granulate route over the
// generic "ABS" one. Ties keep list order.
export function sugerirRota(material, rotas) {
  const text = plain(material);
  const ligada = rotas.find(r => r.ativo && r.materiais?.some(m => plain(m) === text.trim()));
  if (ligada) return ligada;
  const words = text.split(/[^A-Z0-9]+/);
  const match = p => (p.length <= 3 ? words.includes(plain(p)) : text.includes(plain(p)));
  let best = null;
  let bestLen = 0;
  for (const r of rotas) {
    if (!r.ativo) continue;
    const len = Math.max(0, ...(r.palavras ?? []).filter(match).map(p => p.length));
    if (len > bestLen) {
      best = r;
      bestLen = len;
    }
  }
  return best;
}

// Routes saved before materials could be linked: each known material joins the route its name
// would have suggested, so nothing that was receivable stops being receivable.
export function ligarMateriais(rotas, nomes) {
  if (rotas.every(r => r.materiais)) return rotas;
  const ligadas = rotas.map(r => ({...r, materiais: r.materiais ?? []}));
  for (const nome of nomes) {
    if (ligadas.some(r => r.materiais.includes(nome))) continue;
    sugerirRota(nome, ligadas)?.materiais.push(nome);
  }
  return ligadas;
}

// What logistics may receive: active materials linked to an active route.
export function materiaisConfigurados({rotas, materiais}) {
  const ativos = new Set(materiais.filter(m => m.ativo).map(m => m.nome));
  return [...new Set(rotas.filter(r => r.ativo).flatMap(r => r.materiais ?? []))].filter(m => ativos.has(m)).sort();
}

// Steps up to and including the last one any record points at can no longer change.
export function etapasTravadas(b) {
  if (!b) return 0;
  const usadas = [...b.apontamentos.map(a => a.etapaIdx), b.processo?.etapa].filter(i => i != null);
  return usadas.length ? Math.max(...usadas) + 1 : 0;
}
