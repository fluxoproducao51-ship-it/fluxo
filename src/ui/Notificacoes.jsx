import {useState} from 'react';
import {useStore} from '../state/store.jsx';
import {title, today} from '../state/data.js';
import {pausado} from '../state/balance.js';
import {CORES_TIPO, DIAS_PARADO, TIPOS_ATIVIDADE, diasSemAtividade, sinalDeGanho} from '../state/crm.js';
import {Icon} from './Icon.jsx';
import {Menu} from './Menu.jsx';

// The manager's reminders for today, next to their name. The number counts what they have not
// opened yet; opening the bell marks everything shown as read. Read marks live in this browser
// only and start over each day, so tomorrow's reminders count again.
const CHAVE = 'fluxo-notificacoes-lidas';

function lerLidas() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    return salvo?.dia === today() ? new Set(salvo.ids) : new Set();
  } catch {
    return new Set();
  }
}
function gravarLidas(ids) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({dia: today(), ids: [...ids]}));
  } catch {
    // Without storage the count just comes back on the next visit.
  }
}

function useLembretes() {
  const {crm, lotes, envios, abertos} = useStore();
  const hoje = today();
  const abertas = crm.atividades.filter(a => !a.concluida && a.tipo !== 'nota' && a.vencimento && a.vencimento <= hoje);
  const empresaDe = a => crm.empresas.find(e => e.id === a.empresaId)?.nome;
  const daAtividade = a => ({chave: `ativ:${a.id}:${a.vencimento}`, atividade: a, empresa: empresaDe(a)});
  const negociosAbertos = crm.negocios.filter(n => n.situacao === 'aberto');
  return {
    atrasadas: abertas.filter(a => a.vencimento < hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(daAtividade),
    hoje: abertas.filter(a => a.vencimento === hoje).map(daAtividade),
    ganhos: negociosAbertos
      .map(n => ({n, sinal: sinalDeGanho(n, {empresas: crm.empresas, lotes, envios})}))
      .filter(x => x.sinal)
      .map(x => ({chave: `ganho:${x.n.id}`, negocio: x.n, texto: x.sinal})),
    parados: negociosAbertos
      .filter(n => (diasSemAtividade(n, crm.atividades) ?? 0) > DIAS_PARADO)
      .map(n => ({chave: `parado:${n.id}`, negocio: n, dias: diasSemAtividade(n, crm.atividades)})),
    maquinas: abertos.filter(pausado).map(p => {
      const pausa = p.pausas.find(x => !x.fim);
      return {chave: `maq:${p.id}:${pausa?.inicio ?? ''}`, proc: p, motivo: pausa?.motivo};
    })
  };
}

function Item({cor, icone, titulo, detalhe, novo, onClick, acao}) {
  return (
    <div className={`notif-item ${novo ? 'novo' : ''}`} style={{'--c': cor}}>
      {acao}
      <button type="button" className="notif-item-corpo" onClick={onClick}>
        <span className="notif-item-titulo">
          {icone && <Icon name={icone} size={13} />}
          {titulo}
        </span>
        {detalhe && <small>{detalhe}</small>}
      </button>
    </div>
  );
}

export function Notificacoes({onGo}) {
  const {perfil, crmSalvar} = useStore();
  const [aberto, setAberto] = useState(false);
  const [lidas, setLidas] = useState(lerLidas);
  // What was unread when the bell opened stays highlighted while it is open.
  const [novasAoAbrir, setNovasAoAbrir] = useState(new Set());
  const l = useLembretes();
  if (perfil.tipo !== 'gerente') return null;

  const todos = [...l.atrasadas, ...l.hoje, ...l.ganhos, ...l.parados, ...l.maquinas];
  const naoLidas = todos.filter(x => !lidas.has(x.chave)).length;
  const abrir = () => {
    if (aberto) return setAberto(false);
    const chaves = todos.map(x => x.chave);
    setNovasAoAbrir(new Set(chaves.filter(c => !lidas.has(c))));
    const proximas = new Set([...lidas, ...chaves]);
    setLidas(proximas);
    gravarLidas(proximas);
    setAberto(true);
  };
  const ir = (pagina, params) => {
    setAberto(false);
    onGo(pagina, params);
  };
  const concluir = a => crmSalvar('atividades', {...a, concluida: true, concluidaEm: today()});
  const linhaAtividade = x => (
    <Item
      key={x.chave}
      cor={CORES_TIPO[x.atividade.tipo] ?? CORES_TIPO.tarefa}
      titulo={x.atividade.titulo}
      detalhe={[TIPOS_ATIVIDADE[x.atividade.tipo], x.empresa, x.atividade.vencimento < today() ? `desde ${x.atividade.vencimento.split('-').reverse().slice(0, 2).join('/')}` : null].filter(Boolean).join(' · ')}
      novo={novasAoAbrir.has(x.chave)}
      onClick={() => ir('crmatividades')}
      acao={<input type="checkbox" aria-label={`Concluir ${x.atividade.titulo}`} onChange={() => concluir(x.atividade)} />}
    />
  );
  const grupos = [
    {id: 'atrasadas', titulo: 'Atrasadas', cor: 'var(--stop)', itens: l.atrasadas.map(linhaAtividade)},
    {id: 'hoje', titulo: 'Para hoje', itens: l.hoje.map(linhaAtividade)},
    {
      id: 'ganhos',
      titulo: 'Negócios que parecem ganhos',
      itens: l.ganhos.map(x => <Item key={x.chave} cor="var(--ok)" icone="check" titulo={x.negocio.titulo} detalhe={x.texto} novo={novasAoAbrir.has(x.chave)} onClick={() => ir('crm')} />)
    },
    {
      id: 'parados',
      titulo: 'Negócios parados',
      itens: l.parados.map(x => <Item key={x.chave} cor="var(--ready)" icone="pause" titulo={x.negocio.titulo} detalhe={`${x.dias} dias sem atividade`} novo={novasAoAbrir.has(x.chave)} onClick={() => ir('crm')} />)
    },
    {
      id: 'maquinas',
      titulo: 'Máquinas paradas agora',
      itens: l.maquinas.map(x => (
        <Item key={x.chave} cor="var(--stop)" icone="alert" titulo={title(x.proc.setor)} detalhe={[x.motivo ? title(x.motivo) : 'Parada', `lote ${x.proc.lote}`].join(' · ')} novo={novasAoAbrir.has(x.chave)} onClick={() => ir('andamento')} />
      ))
    }
  ].filter(g => g.itens.length);

  return (
    <div className="menu-wrap">
      <button type="button" className={`notif-sino ${naoLidas ? 'tem' : ''}`} onClick={abrir} aria-label={naoLidas ? `${naoLidas} lembretes novos` : 'Lembretes'}>
        <Icon name="bell" size={18} />
        {naoLidas > 0 && <span className="notif-n">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </button>
      <Menu open={aberto} onClose={() => setAberto(false)} align="right">
        <div className="notif-painel">
          <div className="notif-topo">
            <b>Lembretes de hoje</b>
            <span>{todos.length ? `${todos.length} ${todos.length === 1 ? 'item' : 'itens'}` : ''}</span>
          </div>
          {grupos.length ? (
            <div className="notif-lista">
              {grupos.map(g => (
                <section key={g.id}>
                  <p className="notif-grupo" style={g.cor ? {color: g.cor} : null}>
                    {g.titulo} <span>{g.itens.length}</span>
                  </p>
                  {g.itens}
                </section>
              ))}
            </div>
          ) : (
            <div className="notif-vazio">
              <Icon name="check" size={18} />
              Tudo em dia. Nada para hoje.
            </div>
          )}
          <div className="notif-rodape">
            <button type="button" className="trail-link" onClick={() => ir('crmatividades')}>
              Abrir calendário
            </button>
            <button type="button" className="trail-link" onClick={() => ir('crm')}>
              Funil de vendas
            </button>
          </div>
        </div>
      </Menu>
    </div>
  );
}
