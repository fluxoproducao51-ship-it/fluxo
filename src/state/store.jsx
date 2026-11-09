import {createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {computeBalances, filaDe, statusFrom} from './balance.js';
import {aoMudar, carregarTudo, diferencas, gravar, mensagemDeErro, supabase} from './banco.js';

const MAQUINA_KEY = 'fluxo:maquina';

function lerMaquina() {
  try {
    return localStorage.getItem(MAQUINA_KEY) ?? '';
  } catch {
    return '';
  }
}

const addMissing = (list, names) => {
  const known = new Set(list.map(i => i.nome));
  return [...list, ...names.filter(n => n && !known.has(n)).map(nome => ({nome, ativo: true}))];
};

function remember(cadastros, {clientes = [], materiais = [], processos = [], cores = [], operadores = []}) {
  return {
    ...cadastros,
    clientes: addMissing(cadastros.clientes, clientes),
    materiais: addMissing(cadastros.materiais, materiais),
    processos: addMissing(cadastros.processos, processos),
    cores: addMissing(cadastros.cores, cores),
    operadores: addMissing(cadastros.operadores, operadores)
  };
}

const now = () => new Date().toISOString();

const mapAberto = (state, id, fn) => ({...state, abertos: state.abertos.map(p => (p.id === id ? fn(p) : p))});

function reducer(state, action) {
  switch (action.type) {
    case 'receive':
      return {
        ...state,
        lotes: [...state.lotes, action.lote],
        cadastros: remember(state.cadastros, {
          clientes: [action.lote.cliente],
          materiais: action.lote.materiais,
          cores: [action.lote.cor],
          processos: action.lote.rota
        })
      };
    case 'iniciar':
      return {
        ...state,
        abertos: [...state.abertos, {...action.processo, inicio: now(), pausas: []}],
        cadastros: remember(state.cadastros, {operadores: [action.processo.operador]})
      };
    case 'pausar':
      return mapAberto(state, action.id, p => ({...p, pausas: [...p.pausas, {inicio: now(), fim: null, motivo: action.motivo, obs: action.obs}]}));
    case 'retomar':
      return mapAberto(state, action.id, p => ({...p, pausas: p.pausas.map(x => (x.fim ? x : {...x, fim: now()}))}));
    case 'cancelar':
      return {...state, abertos: state.abertos.filter(p => p.id !== action.id)};
    case 'finalizar':
      return {
        ...state,
        abertos: state.abertos.filter(p => p.id !== action.id),
        apontamentos: [...state.apontamentos, action.ap],
        lotes: [...state.lotes, ...action.filhos],
        cadastros: remember(state.cadastros, {materiais: action.filhos.flatMap(f => f.materiais)})
      };
    case 'rota':
      return {
        ...state,
        lotes: state.lotes.map(l =>
          l.lote === action.lote
            ? {...l, rota: action.rota, rotaLog: [...(l.rotaLog ?? []), {quando: now(), por: action.por, antes: l.rota ?? [], depois: action.rota}]}
            : l
        )
      };
    case 'misturar':
      return {
        ...state,
        misturas: [...state.misturas, action.mistura],
        lotes: [...state.lotes, action.lote],
        cadastros: remember(state.cadastros, {materiais: action.lote.materiais})
      };
    case 'enviar':
      return {
        ...state,
        envios: [...state.envios, action.envio],
        ordens: action.fechar ? state.ordens.filter(o => o.lote !== action.envio.lote) : state.ordens,
        cadastros: remember(state.cadastros, {clientes: [action.envio.cliente]})
      };
    case 'cadastro': {
      const list = state.cadastros[action.lista];
      const next =
        action.op === 'add'
          ? addMissing(list, [action.nome])
          : list.map(i => (i.nome === action.nome ? {...i, ativo: !i.ativo} : i));
      return {...state, cadastros: {...state.cadastros, [action.lista]: next}};
    }
    case 'salvarRota': {
      // A material belongs to one route: linking it here takes it off any other.
      const ligados = new Set(action.rota.materiais);
      const rotas = state.cadastros.rotas.map(r => ({...r, materiais: r.materiais.filter(m => !ligados.has(m))}));
      const exists = rotas.some(r => r.id === action.rota.id);
      return {
        ...state,
        cadastros: {
          ...state.cadastros,
          rotas: exists ? rotas.map(r => (r.id === action.rota.id ? action.rota : r)) : [...rotas, action.rota]
        }
      };
    }
    case 'salvarMaquina': {
      const lista = state.cadastros.processos;
      const existe = lista.some(m => m.nome === action.maquina.nome);
      return {
        ...state,
        cadastros: {
          ...state.cadastros,
          processos: existe ? lista.map(m => (m.nome === action.maquina.nome ? {...m, ...action.maquina} : m)) : [...lista, action.maquina]
        }
      };
    }
    case 'removerRota':
      return {...state, cadastros: {...state.cadastros, rotas: state.cadastros.rotas.filter(r => r.id !== action.id)}};
    case 'maquina':
      return {...state, maquina: action.maquina};
    case 'crmSalvar': {
      const lista = state.crm[action.colecao];
      const existe = lista.some(i => i.id === action.item.id);
      return {
        ...state,
        crm: {...state.crm, [action.colecao]: existe ? lista.map(i => (i.id === action.item.id ? {...i, ...action.item} : i)) : [...lista, action.item]}
      };
    }
    case 'crmRemover': {
      const {crm} = state;
      const fora = i => i.id !== action.id;
      if (action.colecao === 'empresas') {
        const negocios = new Set(crm.negocios.filter(n => n.empresaId === action.id).map(n => n.id));
        return {
          ...state,
          crm: {
            ...crm,
            empresas: crm.empresas.filter(fora),
            contatos: crm.contatos.filter(c => c.empresaId !== action.id),
            negocios: crm.negocios.filter(n => n.empresaId !== action.id),
            atividades: crm.atividades.filter(a => a.empresaId !== action.id && !negocios.has(a.negocioId))
          }
        };
      }
      if (action.colecao === 'negocios')
        return {...state, crm: {...crm, negocios: crm.negocios.filter(fora), atividades: crm.atividades.filter(a => a.negocioId !== action.id)}};
      return {...state, crm: {...crm, [action.colecao]: crm[action.colecao].filter(fora)}};
    }
    case 'carregar':
      return {...state, ...action.dados};
    default:
      return state;
  }
}

const Store = createContext(null);

export function StoreProvider({children, perfil, inicial}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({...inicial, perfil, maquina: lerMaquina()}));
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const navigator = useRef(null);
  // What the database is known to hold; every state change is compared against it.
  const salvo = useRef(state);
  const gravacoes = useRef(Promise.resolve());
  const pendentes = useRef(0);

  const recarregar = useCallback(async () => {
    const dados = await carregarTudo(perfil.tipo);
    salvo.current = {...salvo.current, ...dados};
    dispatch({type: 'carregar', dados});
  }, [perfil.tipo]);

  useEffect(() => {
    const mudancas = diferencas(salvo.current, state);
    salvo.current = state;
    if (!mudancas.length) return;
    pendentes.current += 1;
    gravacoes.current = gravacoes.current
      .then(() => gravar(mudancas))
      .catch(erro => {
        // The screen already moved on: show what happened and go back to what really got saved.
        setToast({status: 'Não foi salvo', title: 'A alteração foi desfeita', detail: mensagemDeErro(erro), icon: 'alert', key: Date.now()});
        return recarregar();
      })
      .catch(() => {})
      .finally(() => {
        pendentes.current -= 1;
      });
  }, [state]);

  // Other tablets and offices: refresh shortly after anyone changes something.
  useEffect(() => {
    let espera;
    const parar = aoMudar(() => {
      clearTimeout(espera);
      espera = setTimeout(function tentar() {
        if (pendentes.current) espera = setTimeout(tentar, 500);
        else recarregar().catch(() => {});
      }, 500);
    });
    return () => {
      clearTimeout(espera);
      parar();
    };
  }, [recarregar]);

  const notify = useCallback(next => setToast({...next, key: Date.now()}), []);
  const balances = useMemo(() => computeBalances(state), [state]);
  const fila = useMemo(() => filaDe(state, balances), [state, balances]);

  const value = useMemo(() => {
    const ordemDe = lote => state.ordens.find(o => o.lote === lote);
    const loteDe = id => state.lotes.find(l => l.lote === id);
    const balancoDe = id => balances.get(id);
    const statusDe = lote => statusFrom(lote, balances.get(lote.lote), ordemDe(lote.lote));
    const ativos = lista => state.cadastros[lista].filter(i => i.ativo).map(i => i.nome);
    return {
      ...state,
      balances,
      fila,
      ordemDe,
      loteDe,
      balancoDe,
      statusDe,
      ativos,
      toast,
      notify,
      dismissToast: () => setToast(null),
      abrirLote: lote => navigator.current?.('mapa', {lote}),
      dialog,
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
      go: (...args) => navigator.current?.(...args),
      setNavigator: fn => {
        navigator.current = fn;
      },
      receive: lote => dispatch({type: 'receive', lote}),
      iniciar: processo => dispatch({type: 'iniciar', processo}),
      pausar: (id, motivo, obs) => dispatch({type: 'pausar', id, motivo, obs}),
      retomar: id => dispatch({type: 'retomar', id}),
      cancelar: id => dispatch({type: 'cancelar', id}),
      finalizar: payload => dispatch({type: 'finalizar', ...payload}),
      mudarRota: (lote, rota) => dispatch({type: 'rota', lote, rota, por: state.perfil.nome}),
      misturar: payload => dispatch({type: 'misturar', ...payload}),
      enviar: payload => dispatch({type: 'enviar', ...payload}),
      cadastro: (lista, op, nome) => dispatch({type: 'cadastro', lista, op, nome}),
      salvarRota: rota => dispatch({type: 'salvarRota', rota}),
      salvarMaquina: maquina => dispatch({type: 'salvarMaquina', maquina}),
      removerRota: id => dispatch({type: 'removerRota', id}),
      setMaquina: maquina => {
        try {
          localStorage.setItem(MAQUINA_KEY, maquina);
        } catch {
          // Without storage the choice lasts for this visit.
        }
        dispatch({type: 'maquina', maquina});
      },
      crmSalvar: (colecao, item) => dispatch({type: 'crmSalvar', colecao, item}),
      crmRemover: (colecao, id) => dispatch({type: 'crmRemover', colecao, id}),
      sair: () => supabase.auth.signOut(),
    };
  }, [state, balances, fila, toast, dialog, notify]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export const useStore = () => useContext(Store);
