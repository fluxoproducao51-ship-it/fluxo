import {useEffect, useState} from 'react';
import {StoreProvider, useStore} from './state/store.jsx';
import {Header, ROUTES} from './ui/Header.jsx';
import {Dialogs} from './ui/Dialog.jsx';
import {Toast} from './ui/Toast.jsx';
import {Painel} from './pages/Painel.jsx';
import {Pcp} from './pages/Pcp.jsx';
import {Maquinas} from './pages/Maquinas.jsx';
import {HistoricoMaquinas} from './pages/HistoricoMaquinas.jsx';
import {Mapa} from './pages/Mapa.jsx';
import {Recebimento} from './pages/Recebimento.jsx';
import {Producao} from './pages/Producao.jsx';
import {Lotes} from './pages/Lotes.jsx';
import {Relatorios} from './pages/Relatorios.jsx';
import {Apontar} from './pages/Apontar.jsx';
import {Estoque} from './pages/Estoque.jsx';
import {Misturas} from './pages/Misturas.jsx';
import {Cadastros, MateriaisPagina, RotasPagina} from './pages/Cadastros.jsx';
import {dadosDoPerfil, noChaoDeFabrica, veAPagina} from './state/perfis.js';
import {Acesso} from './ui/Acesso.jsx';
import {Usuarios} from './pages/Usuarios.jsx';
import {CrmAtividades, CrmEmpresas, CrmFunil, CrmHistorico, CrmIndicadores} from './pages/Crm.jsx';

const SCREENS = {
  painel: Painel,
  usuarios: Usuarios,
  crm: CrmFunil,
  crmempresas: CrmEmpresas,
  crmatividades: CrmAtividades,
  crmhistorico: CrmHistorico,
  crmindicadores: CrmIndicadores,
  pcp: Pcp,
  rotas: RotasPagina,
  maquinas: Maquinas,
  historicomaquinas: HistoricoMaquinas,
  materiais: MateriaisPagina,
  mapa: Mapa,
  recebimento: Recebimento,
  producao: Producao,
  apontar: Apontar,
  andamento: Apontar,
  lancamentos: Apontar,
  estoque: Estoque,
  lotes: Lotes,
  relatorios: Relatorios,
  misturas: Misturas,
  cadastros: Cadastros
};

const fromHash = () => {
  const id = location.hash.replace('#/', '');
  return ROUTES.includes(id) ? id : 'painel';
};

function Shell() {
  const {closeDialog, setNavigator, perfil} = useStore();
  const [page, setPage] = useState(fromHash);
  const [params, setParams] = useState(null);
  useEffect(() => {
    const sync = () => setPage(fromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const go = (id, next = null) => {
    closeDialog();
    setParams(next);
    location.hash = `/${id}`;
    setPage(id);
    window.scrollTo({top: 0});
  };
  setNavigator(go);
  // Each role only reaches its own screens; anything else opens its first screen.
  const shown = veAPagina(perfil, page) ? page : dadosDoPerfil(perfil).inicio;
  const Screen = SCREENS[shown];
  return (
    <div className={noChaoDeFabrica(perfil) ? 'app chao' : 'app'}>
      <Header page={shown} onGo={go} />
        <div key={(SCREENS[shown] === Apontar ? 'lancamento' : shown) + JSON.stringify(params)}>
          <Screen onGo={go} initial={params} parte={shown} />
        </div>
      <Dialogs />
      <Toast />
    </div>
  );
}

export function App() {
  return (
    <Acesso>
      {({perfil, dados}) => (
        <StoreProvider key={perfil.id} perfil={perfil} inicial={dados}>
          <Shell />
        </StoreProvider>
      )}
    </Acesso>
  );
}
