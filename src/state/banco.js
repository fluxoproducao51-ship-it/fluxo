// The Supabase side of the store: reading everything a role may see and writing what changed.
// Row-level security in the database decides what each user can do; nothing here is the guard.

import {createClient} from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const paraColuna = campo => (campo === 'pesoNF' ? 'peso_nf' : campo.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`));
const paraCampo = coluna => (coluna === 'peso_nf' ? 'pesoNF' : coluna.replace(/_([a-z])/g, (_, m) => m.toUpperCase()));

// Parents come first: rows are inserted in this order and removed in the reverse.
const TABELAS = [
  {tabela: 'materiais', chave: 'nome', de: s => s.cadastros.materiais, colunas: ['nome', 'ativo']},
  {tabela: 'clientes', chave: 'nome', de: s => s.cadastros.clientes, colunas: ['nome', 'ativo']},
  {tabela: 'cores', chave: 'nome', de: s => s.cadastros.cores, colunas: ['nome', 'ativo']},
  {tabela: 'tipos_perda', chave: 'nome', de: s => s.cadastros.tiposPerda, colunas: ['nome', 'ativo']},
  {tabela: 'motivos_devolucao', chave: 'nome', de: s => s.cadastros.motivosDevolucao, colunas: ['nome', 'ativo']},
  {tabela: 'maquinas', chave: 'nome', de: s => s.cadastros.processos, colunas: ['nome', 'ativo', 'galpao', 'capacidade', 'setor']},
  {tabela: 'rotas', chave: 'id', de: s => s.cadastros.rotas, colunas: ['id', 'nome', 'palavras', 'materiais', 'etapas', 'ativo']},
  {
    tabela: 'lotes',
    chave: 'lote',
    de: s => s.lotes,
    colunas: [
      'lote', 'data', 'cliente', 'materiais', 'nf', 'compra', 'tipo', 'embalagem', 'cor', 'conferente', 'bags', 'bags_materiais', 'bags_rotas', 'peso_entrada', 'peso_nf',
      'peso_do_quadro', 'status', 'setor', 'galpao', 'rota', 'rota_log', 'origem', 'inicial', 'novo', 'importado', 'molhado', 'obs'
    ]
  },
  {tabela: 'ordens', chave: 'id', de: s => s.ordens, colunas: ['id', 'atualizado', 'cliente', 'material', 'quantidade', 'tipo', 'status', 'setor', 'galpao', 'lote']},
  {tabela: 'misturas', chave: 'id', de: s => s.misturas, colunas: ['id', 'lote', 'data', 'material', 'destino', 'obs', 'itens']},
  {
    tabela: 'apontamentos',
    chave: 'id',
    de: s => s.apontamentos,
    colunas: [
      'id', 'lote', 'setor', 'etapa', 'data', 'inicio', 'fim', 'horas', 'pausas', 'usado', 'obtido', 'separacao', 'continua',
      'voltou_para_fila', 'destino', 'po', 'lixo', 'contaminado', 'perdas', 'bags', 'processo', 'operador', 'obs', 'importado'
    ]
  },
  {tabela: 'processos_abertos', chave: 'id', de: s => s.abertos, colunas: ['id', 'lote', 'etapa', 'setor', 'usado', 'operador', 'inicio', 'pausas', 'bags']},
  {tabela: 'envios', chave: 'id', de: s => s.envios, colunas: ['id', 'lote', 'data', 'cliente', 'nf', 'responsavel', 'peso']},
  {tabela: 'devolucoes', chave: 'id', de: s => s.devolucoes, colunas: ['id', 'lote', 'bag', 'peso', 'motivo', 'nf', 'data', 'responsavel', 'obs']},
  {tabela: 'crm_etapas', chave: 'id', de: s => s.crm.etapas, colunas: ['id', 'nome', 'ordem', 'probabilidade', 'ativo'], crm: true},
  {
    tabela: 'crm_empresas',
    chave: 'id',
    de: s => s.crm.empresas,
    colunas: [
      'id', 'nome', 'cnpj', 'segmento', 'porte', 'relacao', 'situacao', 'cidade', 'uf', 'telefone', 'email', 'site', 'origem', 'materiais',
      'volume_mensal_kg', 'cliente_planta', 'observacoes'
    ],
    crm: true
  },
  {tabela: 'crm_contatos', chave: 'id', de: s => s.crm.contatos, colunas: ['id', 'empresa_id', 'nome', 'cargo', 'email', 'telefone', 'principal'], crm: true},
  {
    tabela: 'crm_negocios',
    chave: 'id',
    de: s => s.crm.negocios,
    colunas: [
      'id', 'titulo', 'empresa_id', 'contato_id', 'etapa_id', 'tipo', 'material', 'quantidade_kg', 'preco_kg', 'recorrencia', 'previsao',
      'situacao', 'motivo_perda', 'fechado_em', 'observacoes'
    ],
    crm: true
  },
  {
    tabela: 'crm_atividades',
    chave: 'id',
    de: s => s.crm.atividades,
    colunas: ['id', 'tipo', 'titulo', 'descricao', 'vencimento', 'concluida', 'concluida_em', 'empresa_id', 'negocio_id', 'lote', 'quantidade_kg'],
    crm: true
  }
];

const POR_PAGINA = 1000;

async function lerTabela(tabela) {
  const linhas = [];
  for (let de = 0; ; de += POR_PAGINA) {
    const {data, error} = await supabase.from(tabela).select('*').range(de, de + POR_PAGINA - 1);
    if (error) throw error;
    linhas.push(...data.map(l => Object.fromEntries(Object.entries(l).map(([k, v]) => [paraCampo(k), v]))));
    if (data.length < POR_PAGINA) return linhas;
  }
}

// Each role reads what its policies allow; a table it can't see just comes back empty.
export async function carregarTudo(tipo) {
  const uteis = TABELAS.filter(t => !t.crm || tipo === 'gerente');
  const lidas = await Promise.all(uteis.map(t => lerTabela(t.tabela)));
  const de = nome => lidas[uteis.findIndex(t => t.tabela === nome)] ?? [];
  // Operators are the users with the production role. Only a manager posts on someone else's behalf.
  let operadores = [];
  if (tipo === 'gerente') {
    const {data, error} = await supabase.from('perfis').select('nome').eq('papel', 'producao').order('nome');
    if (error) throw error;
    operadores = data.map(p => ({nome: p.nome.toUpperCase(), ativo: true}));
  }
  return {
    cadastros: {
      materiais: de('materiais'),
      clientes: de('clientes'),
      cores: de('cores'),
      tiposPerda: de('tipos_perda').sort((a, b) => (a.criadoEm ?? '').localeCompare(b.criadoEm ?? '')),
      motivosDevolucao: de('motivos_devolucao').sort((a, b) => (a.criadoEm ?? '').localeCompare(b.criadoEm ?? '')),
      operadores,
      processos: de('maquinas'),
      rotas: de('rotas')
    },
    lotes: de('lotes'),
    ordens: de('ordens'),
    misturas: de('misturas'),
    apontamentos: de('apontamentos'),
    abertos: de('processos_abertos'),
    envios: de('envios'),
    devolucoes: de('devolucoes').map(d => ({...d, peso: Number(d.peso)})),
    crm: {
      etapas: de('crm_etapas').sort((a, b) => a.ordem - b.ordem),
      empresas: de('crm_empresas'),
      contatos: de('crm_contatos'),
      negocios: de('crm_negocios'),
      atividades: de('crm_atividades')
    }
  };
}

function paraLinha(item, colunas) {
  const linha = {};
  for (const [campo, valor] of Object.entries(item)) {
    const coluna = paraColuna(campo);
    if (colunas.includes(coluna) && valor !== undefined) linha[coluna] = valor;
  }
  return linha;
}

// What one state change means for the database, table by table.
export function diferencas(antes, depois) {
  const mudancas = [];
  for (const t of TABELAS) {
    const a = t.de(antes);
    const d = t.de(depois);
    if (a === d) continue;
    const anteriores = new Map(a.map(i => [i[t.chave], i]));
    const atuais = new Set(d.map(i => i[t.chave]));
    const inserir = d.filter(i => !anteriores.has(i[t.chave]));
    const alterar = d.filter(i => anteriores.has(i[t.chave]) && anteriores.get(i[t.chave]) !== i && JSON.stringify(anteriores.get(i[t.chave])) !== JSON.stringify(i));
    const remover = a.filter(i => !atuais.has(i[t.chave])).map(i => i[t.chave]);
    if (inserir.length || alterar.length || remover.length) mudancas.push({t, inserir, alterar, remover});
  }
  return mudancas;
}

// Inserts and updates first, removals last: if the connection drops halfway, a finished process
// stays open rather than vanishing, and the reload shows the operator what was saved.
export async function gravar(mudancas) {
  for (const {t, inserir} of mudancas) {
    if (!inserir.length) continue;
    const {error} = await supabase.from(t.tabela).insert(inserir.map(i => paraLinha(i, t.colunas)));
    if (error) throw error;
  }
  for (const {t, alterar} of mudancas) {
    for (const item of alterar) {
      const {error} = await supabase.from(t.tabela).update(paraLinha(item, t.colunas)).eq(t.chave, item[t.chave]);
      if (error) throw error;
    }
  }
  for (const {t, remover} of [...mudancas].reverse()) {
    if (!remover.length) continue;
    const {error} = await supabase.from(t.tabela).delete().in(t.chave, remover);
    if (error) throw error;
  }
}

// Any change by anyone (a tablet on the floor, another office) reaches every open screen.
export function aoMudar(callback) {
  const canal = supabase.channel('fluxo-mudancas').on('postgres_changes', {event: '*', schema: 'public'}, callback).subscribe();
  return () => supabase.removeChannel(canal);
}

export function mensagemDeErro(erro) {
  if (erro?.code === '42501') return 'Seu perfil não tem permissão para esta ação.';
  if (erro?.code === '23505') return 'Já existe um registro com esse identificador.';
  if (erro?.message?.includes('Failed to fetch')) return 'Sem conexão com o servidor.';
  return erro?.message ?? 'Erro desconhecido.';
}
