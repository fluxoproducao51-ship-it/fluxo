import {useEffect, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {Icon} from './Icon.jsx';
import {Logo} from './Logo.jsx';
import {Menu, MenuDivider, MenuItem} from './Menu.jsx';
import {VERSION} from '../version.js';
import {dadosDoPerfil, noChaoDeFabrica, veAPagina} from '../state/perfis.js';
import {pausado} from '../state/balance.js';

const GROUPS = [
  {
    title: 'Comercial',
    items: [
      {id: 'crm', label: 'Funil de vendas', icon: 'filter'},
      {id: 'crmempresas', label: 'Empresas', icon: 'factory'},
      {id: 'crmatividades', label: 'Atividades', icon: 'bell'},
      {id: 'crmhistorico', label: 'Histórico de atividades', icon: 'layers'},
      {id: 'crmindicadores', label: 'Indicadores de vendas', icon: 'chart'}
    ]
  },
  {
    title: 'Monitoramento',
    items: [
      {id: 'painel', label: 'Painel', icon: 'home'},
      {id: 'pcp', label: 'Central do PCP', icon: 'bell'},
      {id: 'mapa', label: 'Mapa do lote', icon: 'flow'},
      {id: 'lotes', label: 'Lotes', icon: 'layers'},
      {id: 'relatorios', label: 'Relatórios', icon: 'chart'},
      {id: 'historicomaquinas', label: 'Histórico por máquina', icon: 'engrenagem'}
    ]
  },
  {
    title: 'Operação',
    items: [
      {id: 'recebimento', label: 'Recebimento', icon: 'scale'},
      {id: 'producao', label: 'Produção', icon: 'factory'},
      {id: 'apontar', label: 'Iniciar processo', icon: 'play'},
      {id: 'andamento', label: 'Em andamento', icon: 'pulse'},
      {id: 'lancamentos', label: 'Meus lançamentos', icon: 'check'},
      {id: 'misturas', label: 'Misturas', icon: 'filter'},
      {id: 'estoque', label: 'Estoque e envios', icon: 'truck'}
    ]
  },
  {
    title: 'Configuração',
    items: [
      {id: 'rotas', label: 'Rotas', icon: 'flow'},
      {id: 'materiais', label: 'Materiais', icon: 'bag'},
      {id: 'maquinas', label: 'Máquinas', icon: 'engrenagem'},
      {id: 'cadastros', label: 'Cadastros', icon: 'bag'},
      {id: 'usuarios', label: 'Usuários', icon: 'user'},
    ]
  }
];

const ALL = GROUPS.flatMap(g => g.items);
// The phone bar keeps the daily screens; the others stay in its "Mais" menu.
const BOTTOM = ['painel', 'pcp', 'mapa', 'recebimento', 'apontar', 'andamento', 'lancamentos', 'producao', 'lotes'];

export const ROUTES = ALL.map(p => p.id);

function PerfilMenu() {
  const {perfil, sair} = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-wrap">
      <button type="button" className="profile" onClick={() => setOpen(o => !o)} aria-label="Perfil">
        <Icon name="user" size={16} />
        {perfil.nome}
        <Icon name="chevronDown" size={14} />
      </button>
      <Menu open={open} onClose={() => setOpen(false)} align="right">
        <div className="menu-head">
          <b>{perfil.nome}</b>
          <span>{dadosDoPerfil(perfil).cargo}</span>
          <span>{perfil.email}</span>
        </div>
        <MenuDivider />
        <MenuItem label="Sair" onSelect={sair} />
      </Menu>
    </div>
  );
}

function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const dia = agora.toLocaleDateString('pt-BR');
  const hora = agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  return (
    <span className="clock">
      {dia} {hora}
    </span>
  );
}

function ResumoFabrica() {
  const {fila} = useStore();
  const n = status => fila.filter(o => o.status === status).length;
  return (
    <div className="plant" aria-label="Situação da fábrica">
      <span className="plant-cell" style={{'--c': 'var(--run)'}}>
        <b>{n('EM PROCESSO')}</b> em processo
      </span>
      <span className="plant-cell" style={{'--c': n('PARADO') ? 'var(--stop)' : undefined}}>
        <b>{n('PARADO')}</b> parados
      </span>
      <span className="plant-cell opt">
        <b>{n('AGUARDANDO INICIO')}</b> na fila
      </span>
      <span className="plant-cell opt" style={{'--c': 'var(--ready)'}}>
        <b>{n('A PRONTA ENTREGA')}</b> prontos
      </span>
    </div>
  );
}

function BottomNav({active, onGo, itens}) {
  const [open, setOpen] = useState(false);
  const principais = BOTTOM.filter(id => itens.some(p => p.id === id)).slice(0, 4);
  const rest = itens.filter(p => !principais.includes(p.id));
  return (
    <nav className="bottom-nav">
      {principais.map(id => {
        const p = ALL.find(x => x.id === id);
        return (
          <button key={id} type="button" className={`bottom-item ${active === id ? 'current' : ''}`} onClick={() => onGo(id)}>
            <Icon name={p.icon} size={18} />
            {{recebimento: 'Receber', pcp: 'PCP', mapa: 'Mapa', apontar: 'Iniciar', andamento: 'Andamento', lancamentos: 'Hoje'}[id] ?? p.label}
          </button>
        );
      })}
      <div className="menu-wrap" style={{flex: 1}}>
        <button
          type="button"
          className={`bottom-item ${rest.some(p => p.id === active) ? 'current' : ''}`}
          style={{width: '100%'}}
          onClick={() => setOpen(o => !o)}
        >
          <Icon name="more" size={18} stroke={3.4} />
          Mais
        </button>
        <Menu open={open} onClose={() => setOpen(false)} align="right" up>
          {rest.map(p => (
            <MenuItem key={p.id} label={p.label} checked={active === p.id} onSelect={() => (setOpen(false), onGo(p.id))} />
          ))}
        </Menu>
      </div>
    </nav>
  );
}

export function Header({page, onGo}) {
  const {fila, perfil, abertos, maquina} = useStore();
  const active = page;
  const running = fila.filter(o => o.status === 'EM PROCESSO').length;
  const titulo = ALL.find(p => p.id === page)?.label;
  const naMaquina = abertos.filter(p => !maquina || p.setor === maquina);
  const parados = naMaquina.filter(pausado).length;
  const grupos = GROUPS.map(g => ({...g, items: g.items.filter(p => veAPagina(perfil, p.id))})).filter(g => g.items.length);

  return (
    <>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => onGo(dadosDoPerfil(perfil).inicio)}>
          <Logo sub={noChaoDeFabrica(perfil) ? dadosDoPerfil(perfil).cargo : undefined} />
        </button>
        <span className="topbar-title">{titulo}</span>
        <span className="topbar-spacer" />
        <ResumoFabrica />
        <Relogio />
        <PerfilMenu />
      </header>
      <aside className="sidebar">
        {grupos.map(g => (
          <nav key={g.title} className="side-group">
            <div className="side-title">{g.title}</div>
            {g.items.map(p => (
              <button
                key={p.id}
                type="button"
                className={`side-item ${active === p.id ? 'current' : ''}`}
                aria-current={active === p.id ? 'page' : undefined}
                onClick={() => onGo(p.id)}
              >
                <Icon name={p.icon} size={16} />
                {p.label}
                {p.id === 'producao' && running > 0 && <span className="count">{running}</span>}
                {p.id === 'andamento' && (
                  <span className={parados ? 'count parado' : 'count'} title={parados ? `${parados} parados` : undefined}>
                    {naMaquina.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        ))}
        <div className="side-foot">Versão {VERSION}</div>
      </aside>
      <BottomNav active={active} onGo={onGo} itens={grupos.flatMap(g => g.items)} />
    </>
  );
}
