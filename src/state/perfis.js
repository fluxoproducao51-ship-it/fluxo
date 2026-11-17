// Who sees what. Each role reaches only its own pages and actions.

export const PERFIS = {
  gerente: {
    cargo: 'Gerente',
    resumo: 'Vê tudo',
    inicio: 'painel',
    paginas: ['painel', 'pcp', 'mapa', 'lotes', 'relatorios', 'historicomaquinas', 'historicobags', 'recebimento', 'producao', 'apontar', 'andamento', 'misturas', 'estoque', 'maquinas', 'cadastros', 'usuarios', 'crm', 'crmempresas', 'crmatividades', 'crmhistorico', 'crmindicadores'],
    acoes: ['editarRota', 'apontar', 'enviar', 'excluirLote', 'devolver', 'verMapa', 'verFicha']
  },
  pcp: {
    cargo: 'Planejamento e controle',
    resumo: 'Central do PCP, mapa, estoque, rotas e máquinas',
    inicio: 'pcp',
    paginas: ['pcp', 'mapa', 'lotes', 'relatorios', 'historicomaquinas', 'historicobags', 'producao', 'estoque', 'rotas', 'materiais', 'maquinas'],
    acoes: ['editarRota', 'enviar', 'excluirLote', 'devolver', 'verMapa', 'verFicha']
  },
  logistica: {
    cargo: 'Operador logístico',
    resumo: 'Só recebimento',
    inicio: 'recebimento',
    chao: true,
    paginas: ['recebimento'],
    acoes: ['devolver']
  },
  producao: {
    cargo: 'Operador de produção',
    resumo: 'Só lançamento de produção',
    inicio: 'andamento',
    chao: true,
    paginas: ['apontar', 'andamento', 'lancamentos'],
    acoes: ['apontar']
  }
};

export const dadosDoPerfil = perfil => PERFIS[perfil.tipo] ?? PERFIS.gerente;
export const pode = (perfil, acao) => dadosDoPerfil(perfil).acoes.includes(acao);
export const veAPagina = (perfil, pagina) => dadosDoPerfil(perfil).paginas.includes(pagina);
// Shop-floor roles work on a tablet: same layout as everyone, with larger controls.
export const noChaoDeFabrica = perfil => Boolean(dadosDoPerfil(perfil).chao);
