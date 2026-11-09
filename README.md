# Fluxo · Controle de Produção

Sistema web para recebimento, produção e rastreabilidade de lotes de uma recicladora de plástico.
O visual é de sistema industrial: fundo branco, navegação lateral, tabelas densas, cantos retos e cor
reservada para a situação de lotes e máquinas.

## Rodar

Copie `.env.example` para `.env.local`, preencha as duas variáveis e rode:

```sh
npm install
npm run dev
```

## Telas

- **Painel**: indicadores da fábrica, tabela de lotes com a etapa atual, carga por etapa, balanço de massa e resumos.
- **Recebimento**: nota fiscal, pesagem volume a volume, comparação NF × balança e geração do lote e da ordem de produção.
- **Produção**: quadro por status (aguardando, em processo, parado, pronto), com filtro por galpão.
- **Iniciar processo, Em andamento e Meus lançamentos** (menu lateral): assistente passo a passo. Iniciar (lote → máquina → quantidade → conferir),
  pausar com motivo, retomar e finalizar (saída → perdas → conferir). A máquina segue a rota do lote: o material só
  chega a uma etapa depois de passar pela anterior. Pode separar em lotes filhos.
- **Rotas**: definidas no recebimento (sugeridas pelo material) e editáveis em Cadastros → Rotas. No Mapa do lote,
  o PCP ou o gerente muda as etapas que ainda não começaram; a mudança fica registrada nos dados do lote.
- **Estoque e envios**: saldo de produto acabado por lote e envio total ou parcial ao cliente.
- **Mapa do lote**: desenho ligado do caminho do lote: onde o material está, por onde passou e para onde vai, com separações e
  misturas como ramificações. O gerente edita a rota nos blocos: `+` entre etapas, `x` para remover, arrastar máquinas para o
  mapa ou ligar uma porta a outra. A mudança só vale ao salvar e fica registrada na trilha.
- **Lotes**: busca e filtros; cada lote abre no Mapa do lote, com etapas, separações, misturas, envios e dados do lote.
- **Relatórios**: recebido por mês, por cliente e por material, e divergência de peso.
- **Mais**: misturas e cadastros (materiais, clientes, cores, operadores).
- **Máquinas** (PCP e Gerente): cadastro das máquinas usadas nas rotas e no lançamento, com galpão e capacidade.
- **Central do PCP**: o que precisa de decisão agora, fila e carga por máquina, e o que chegou da logística sem iniciar.
- **Funções** (permissões em `src/state/perfis.js`): Gerente vê tudo; PCP vê central, mapa, quadro,
  lotes, relatórios, estoque e envios, rotas, materiais e máquinas; Operador logístico vê só o recebimento e não define rota; Operador de produção vê só o lançamento, por máquina.

## Banco de dados e acesso

Os dados ficam no Supabase, com políticas de segurança (RLS) por função em todas as tabelas. Copie `.env.example` para
`.env.local` e preencha a URL e a chave publicável do projeto.

- O gerente cria os usuários e define a função de cada um em **Usuários**, pela função `criar-usuario` do servidor.
- O sistema começa vazio: máquinas, rotas, materiais e clientes são cadastrados nas telas de Configuração.
- O **CRM** (funil, empresas, atividades e indicadores) só existe para o gerente, também no banco.

## Publicação

Na Vercel, o projeto é detectado como Vite. Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis de ambiente.
Nunca coloque chaves `service_role` ou `sb_secret` em variáveis `VITE_`, porque elas vão para o navegador.
