import {useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {kg, today} from '../state/data.js';
import {CORES_TIPO, TIPOS_ATIVIDADE, proximoPasso} from '../state/crm.js';
import {Button} from '../ui/Button.jsx';
import {parseKg} from '../ui/Dialog.jsx';
import {Icon} from '../ui/Icon.jsx';
import {Campo, Janela, JanelaNegocio, Selecao, vazioParaNulo} from './Crm.jsx';

// Activities as a calendar, the way Outlook shows a mailbox calendar: month, week and an agenda
// list, a mini calendar to jump around, filters by kind, drag to move to another day.

const ORDEM_TIPOS = ['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'amostra', 'proposta', 'tarefa', 'nota'];
const SITUACOES = {todas: 'Todas', pendentes: 'Pendentes', atrasadas: 'Atrasadas', concluidas: 'Concluídas'};
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Dates stay as local 'YYYY-MM-DD' strings, the format the activities are saved in.
const paraData = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const paraIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const somaDias = (iso, n) => {
  const d = paraData(iso);
  d.setDate(d.getDate() + n);
  return paraIso(d);
};
const inicioDaSemana = iso => somaDias(iso, -paraData(iso).getDay());
const inicioDoMes = iso => `${iso.slice(0, 7)}-01`;
const somaMeses = (iso, n) => {
  const d = paraData(inicioDoMes(iso));
  d.setMonth(d.getMonth() + n);
  return paraIso(d);
};
// Six full weeks, so every month draws with the same height.
const gradeDoMes = iso => {
  const ini = inicioDaSemana(inicioDoMes(iso));
  return Array.from({length: 42}, (_, i) => somaDias(ini, i));
};
const diaCurto = iso => `${paraData(iso).getDate()} ${MESES[paraData(iso).getMonth()].slice(0, 3)}`;
const diaLongo = iso => `${SEMANA_LONGA[paraData(iso).getDay()]}, ${paraData(iso).getDate()} de ${MESES[paraData(iso).getMonth()]}`;

const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);
const atrasada = a => !a.concluida && a.vencimento && a.vencimento < today();
const ordemNoDia = (a, b) => Number(a.concluida) - Number(b.concluida) || ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) || a.titulo.localeCompare(b.titulo);

/* ---------- One activity, as a chip on the grid ---------- */

function Evento({a, compacto, onAbrir}) {
  const {crm} = useStore();
  const empresa = crm.empresas.find(e => e.id === a.empresaId);
  const negocio = crm.negocios.find(n => n.id === a.negocioId);
  return (
    <button
      type="button"
      className={`cal-evento ${a.concluida ? 'feito' : ''} ${atrasada(a) ? 'atrasado' : ''} ${compacto ? 'compacto' : ''}`}
      style={{'--c': CORES_TIPO[a.tipo] ?? CORES_TIPO.tarefa}}
      draggable={!a.concluida}
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', a.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={e => {
        e.stopPropagation();
        onAbrir(a);
      }}
      title={`${TIPOS_ATIVIDADE[a.tipo]}: ${a.titulo}${empresa ? ` · ${empresa.nome}` : ''}`}
    >
      <span className="cal-evento-titulo">
        {a.concluida && <Icon name="check" size={11} stroke={3} />}
        {a.titulo}
      </span>
      {!compacto && (
        <>
          <span className="cal-evento-meta">{TIPOS_ATIVIDADE[a.tipo]}{a.quantidadeKg ? ` · ${kg(a.quantidadeKg)}` : ''}</span>
          {(empresa || negocio) && <span className="cal-evento-meta">{[empresa?.nome, negocio?.titulo].filter(Boolean).join(' · ')}</span>}
        </>
      )}
    </button>
  );
}

// A day that takes a dropped activity and opens a new one when its empty space is clicked.
function useSoltar(onMover) {
  const [sobre, setSobre] = useState(null);
  const props = dia => ({
    onDragOver: e => {
      e.preventDefault();
      setSobre(dia);
    },
    onDragLeave: () => setSobre(s => (s === dia ? null : s)),
    onDrop: e => {
      e.preventDefault();
      setSobre(null);
      const id = e.dataTransfer.getData('text/plain');
      if (id) onMover(id, dia);
    }
  });
  return {sobre, props};
}

/* ---------- Views ---------- */

function VisaoMes({referencia, porDia, selecionado, onSelecionar, onNova, onAbrir, onMover}) {
  const dias = gradeDoMes(referencia);
  const mes = referencia.slice(0, 7);
  const hoje = today();
  const {sobre, props} = useSoltar(onMover);
  return (
    <div className="cal-mes">
      {SEMANA.map(s => (
        <div key={s} className="cal-cabeca-dia">
          {s}
        </div>
      ))}
      {dias.map(dia => {
        const lista = porDia.get(dia) ?? [];
        const visiveis = lista.slice(0, 3);
        return (
          <div
            key={dia}
            className={`cal-dia ${dia.slice(0, 7) !== mes ? 'fora' : ''} ${dia === hoje ? 'hoje' : ''} ${dia === selecionado ? 'selecionado' : ''} ${sobre === dia ? 'sobre' : ''}`}
            onClick={() => onSelecionar(dia)}
            onDoubleClick={() => onNova(dia)}
            {...props(dia)}
          >
            <div className="cal-dia-topo">
              <span className="cal-dia-n">{paraData(dia).getDate()}</span>
              <button
                type="button"
                className="cal-mais"
                aria-label={`Nova atividade em ${diaLongo(dia)}`}
                onClick={e => {
                  e.stopPropagation();
                  onNova(dia);
                }}
              >
                <Icon name="plus" size={12} stroke={2.6} />
              </button>
            </div>
            {visiveis.map(a => (
              <Evento key={a.id} a={a} compacto onAbrir={onAbrir} />
            ))}
            {lista.length > visiveis.length && (
              <button
                type="button"
                className="cal-mais-n"
                onClick={e => {
                  e.stopPropagation();
                  onSelecionar(dia);
                }}
              >
                +{lista.length - visiveis.length} mais
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VisaoSemana({referencia, porDia, selecionado, onSelecionar, onNova, onAbrir, onMover}) {
  const ini = inicioDaSemana(referencia);
  const dias = Array.from({length: 7}, (_, i) => somaDias(ini, i));
  const hoje = today();
  const {sobre, props} = useSoltar(onMover);
  return (
    <div className="cal-semana">
      {dias.map(dia => {
        const lista = porDia.get(dia) ?? [];
        return (
          <div
            key={dia}
            className={`cal-coluna ${dia === hoje ? 'hoje' : ''} ${dia === selecionado ? 'selecionado' : ''} ${sobre === dia ? 'sobre' : ''}`}
            onClick={() => onSelecionar(dia)}
            onDoubleClick={() => onNova(dia)}
            {...props(dia)}
          >
            <div className="cal-coluna-topo">
              <span>{SEMANA[paraData(dia).getDay()]}</span>
              <b>{paraData(dia).getDate()}</b>
            </div>
            <div className="cal-coluna-lista">
              {lista.map(a => (
                <Evento key={a.id} a={a} onAbrir={onAbrir} />
              ))}
              <button
                type="button"
                className="cal-nova-linha"
                onClick={e => {
                  e.stopPropagation();
                  onNova(dia);
                }}
              >
                <Icon name="plus" size={12} /> Atividade
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VisaoAgenda({referencia, lista, onAbrir, onNova, passado}) {
  const hoje = today();
  const fim = somaDias(referencia, 30);
  // Done activities look back: the 30 days up to the reference day, most recent first.
  const inicio = somaDias(referencia, -30);
  const grupos = passado
    ? Array.from(new Set(lista.filter(a => a.vencimento && a.vencimento >= inicio && a.vencimento <= referencia).map(a => a.vencimento)))
        .sort()
        .reverse()
        .map(dia => ({dia, titulo: dia === hoje ? `Hoje · ${diaLongo(dia)}` : maiuscula(diaLongo(dia)), itens: lista.filter(a => a.vencimento === dia)}))
    : [
    {titulo: 'Atrasadas', itens: lista.filter(a => atrasada(a))},
    ...Array.from(new Set(lista.filter(a => a.vencimento && a.vencimento >= referencia && a.vencimento <= fim && !atrasada(a)).map(a => a.vencimento)))
      .sort()
      .map(dia => ({dia, titulo: dia === hoje ? `Hoje · ${diaLongo(dia)}` : maiuscula(diaLongo(dia)), itens: lista.filter(a => a.vencimento === dia && !atrasada(a))})),
    {titulo: 'Sem data', itens: lista.filter(a => !a.vencimento && !a.concluida)}
  ];
  const visiveis = grupos.filter(g => g.itens.length);
  return (
    <div className="cal-agenda">
      <p className="cal-agenda-nota">{passado ? `Últimos 30 dias até ${diaCurto(referencia)}.` : `Próximos 30 dias a partir de ${diaCurto(referencia)}.`}</p>
      {visiveis.length ? (
        visiveis.map(g => (
          <section key={g.titulo} className="cal-agenda-grupo">
            <header className={g.titulo === 'Atrasadas' ? 'atrasado' : ''}>
              <b>{g.titulo}</b>
              <span>{g.itens.length}</span>
              {g.dia && !passado && (
                <button type="button" className="trail-link" onClick={() => onNova(g.dia)}>
                  + Atividade
                </button>
              )}
            </header>
            <div className="cal-agenda-itens">
              {g.itens.sort(ordemNoDia).map(a => (
                <Evento key={a.id} a={a} onAbrir={onAbrir} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="painel-empty panel">Nada agendado neste período.</div>
      )}
    </div>
  );
}

/* ---------- Side column ---------- */

function MiniCalendario({referencia, selecionado, comAtividade, onEscolher}) {
  const [mes, setMes] = useState(inicioDoMes(selecionado ?? referencia));
  const dias = gradeDoMes(mes);
  const hoje = today();
  return (
    <div className="cal-mini">
      <div className="cal-mini-topo">
        <button type="button" className="cal-seta" aria-label="Mês anterior" onClick={() => setMes(m => somaMeses(m, -1))}>
          ‹
        </button>
        <b>
          {MESES[paraData(mes).getMonth()]} {paraData(mes).getFullYear()}
        </b>
        <button type="button" className="cal-seta" aria-label="Próximo mês" onClick={() => setMes(m => somaMeses(m, 1))}>
          ›
        </button>
      </div>
      <div className="cal-mini-grade">
        {SEMANA.map(s => (
          <span key={s} className="cal-mini-sem">
            {s[0]}
          </span>
        ))}
        {dias.map(dia => (
          <button
            key={dia}
            type="button"
            className={`cal-mini-dia ${dia.slice(0, 7) !== mes.slice(0, 7) ? 'fora' : ''} ${dia === hoje ? 'hoje' : ''} ${dia === selecionado ? 'on' : ''}`}
            onClick={() => onEscolher(dia)}
          >
            {paraData(dia).getDate()}
            {comAtividade.has(dia) && <i />}
          </button>
        ))}
      </div>
    </div>
  );
}

function PainelDoDia({dia, lista, onAbrir, onNova, onFechar}) {
  const {crmSalvar} = useStore();
  return (
    <aside className="cal-painel">
      <div className="cal-painel-topo">
        <div>
          <span className="label">{dia === today() ? 'Hoje' : SEMANA_LONGA[paraData(dia).getDay()]}</span>
          <b>{diaCurto(dia)}</b>
        </div>
        <button type="button" className="no-x" aria-label="Fechar o dia" onClick={onFechar}>
          <Icon name="x" size={15} />
        </button>
      </div>
      {lista.length ? (
        <div className="cal-painel-lista">
          {lista.map(a => (
            <div key={a.id} className={`cal-painel-item ${a.concluida ? 'feito' : ''}`} style={{'--c': CORES_TIPO[a.tipo] ?? CORES_TIPO.tarefa}}>
              {a.tipo === 'nota' ? (
                <span className="cal-painel-nota" />
              ) : (
                <input
                  type="checkbox"
                  checked={a.concluida}
                  aria-label={`Concluir ${a.titulo}`}
                  onChange={e => crmSalvar('atividades', {...a, concluida: e.target.checked, concluidaEm: e.target.checked ? today() : null})}
                />
              )}
              <button type="button" onClick={() => onAbrir(a)}>
                <b>{a.titulo}</b>
                <small>{TIPOS_ATIVIDADE[a.tipo]}</small>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="page-sub">Nada neste dia.</p>
      )}
      <Button size="sm" icon="plus" label="Nova atividade neste dia" onClick={() => onNova(dia)} />
    </aside>
  );
}

/* ---------- Create / edit ---------- */

function JanelaAtividade({inicial, onFechar, onAbrirNegocio}) {
  const {crm, crmSalvar, crmRemover, go} = useStore();
  const existente = crm.atividades.find(a => a.id === inicial.id);
  const [a, setA] = useState(() => ({...inicial, kgTexto: inicial.quantidadeKg ? String(inicial.quantidadeKg) : ''}));
  const [erro, setErro] = useState(null);
  const [removendo, setRemovendo] = useState(false);
  const set = campo => valor => setA(x => ({...x, [campo]: valor}));
  const empresas = Object.fromEntries([...crm.empresas].sort((x, y) => x.nome.localeCompare(y.nome)).map(e => [e.id, e.nome]));
  const negocios = Object.fromEntries(crm.negocios.filter(n => !a.empresaId || n.empresaId === a.empresaId).map(n => [n.id, n.titulo]));
  const negocio = crm.negocios.find(n => n.id === a.negocioId);
  const empresa = crm.empresas.find(e => e.id === a.empresaId);
  const salvar = extra => {
    if (!a.titulo?.trim()) return setErro('Escreva o que precisa ser feito.');
    const {kgTexto, ...limpo} = a;
    crmSalvar('atividades', {
      ...limpo,
      titulo: limpo.titulo.trim(),
      descricao: vazioParaNulo(limpo.descricao),
      vencimento: limpo.vencimento || null,
      empresaId: limpo.empresaId || (negocio?.empresaId ?? null),
      negocioId: limpo.negocioId || null,
      quantidadeKg: limpo.tipo === 'amostra' ? parseKg(kgTexto) : null,
      ...extra
    });
    onFechar();
  };
  const tipos = Object.fromEntries(Object.entries(TIPOS_ATIVIDADE));
  return (
    <Janela titulo={existente ? 'Atividade' : 'Nova atividade'} onFechar={onFechar} largura={620}>
      {existente?.concluida && <div className="crm-faixa ganho">Concluída em {existente.concluidaEm ? diaCurto(existente.concluidaEm) : '—'}</div>}
      {existente && atrasada(existente) && <div className="crm-faixa perdido">Atrasada desde {diaCurto(existente.vencimento)}</div>}
      <div className="fields">
        <Campo rotulo="O que fazer" largo>
          <input className="input" value={a.titulo ?? ''} onChange={e => set('titulo')(e.target.value)} placeholder="Ex.: Ligar para o comprador" autoFocus={!existente} />
        </Campo>
        <Campo rotulo="Tipo">
          <Selecao valor={a.tipo} onChange={set('tipo')} opcoes={tipos} vazio={null} />
        </Campo>
        <Campo rotulo="Data">
          <input className="input" type="date" value={a.vencimento ?? ''} onChange={e => set('vencimento')(e.target.value)} />
        </Campo>
        <Campo rotulo="Empresa">
          <Selecao valor={a.empresaId} onChange={v => setA(x => ({...x, empresaId: v || null, negocioId: null}))} opcoes={empresas} vazio="Sem empresa" />
        </Campo>
        <Campo rotulo="Negócio">
          <Selecao valor={a.negocioId} onChange={set('negocioId')} opcoes={negocios} vazio="Sem negócio" />
        </Campo>
        {a.tipo === 'amostra' && (
          <Campo rotulo="Peso da amostra (kg)">
            <input className="input" inputMode="numeric" value={a.kgTexto} onChange={e => set('kgTexto')(e.target.value)} />
          </Campo>
        )}
        <Campo rotulo="Detalhes" largo>
          <textarea className="input" value={a.descricao ?? ''} onChange={e => set('descricao')(e.target.value)} placeholder="Com quem falar, o que levar, o que combinar…" />
        </Campo>
      </div>
      {(negocio || empresa) && existente && (
        <div className="cal-links">
          {negocio && (
            <button type="button" className="trail-link" onClick={() => onAbrirNegocio(negocio)}>
              Abrir negócio: {negocio.titulo}
            </button>
          )}
          {empresa && (
            <button type="button" className="trail-link" onClick={() => go('crmempresas', {id: empresa.id})}>
              Abrir empresa: {empresa.nome}
            </button>
          )}
        </div>
      )}
      {erro && <p className="wiz-err" style={{marginTop: 10}}>{erro}</p>}
      <div className="crm-rodape">
        <Button variant="primary" icon="check" label="Salvar" onClick={() => salvar()} />
        {a.tipo !== 'nota' && !existente?.concluida && <Button className="crm-ganhar" icon="check" label="Salvar e concluir" onClick={() => salvar({concluida: true, concluidaEm: today()})} />}
        {existente?.concluida && <Button label="Reabrir" onClick={() => salvar({concluida: false, concluidaEm: null})} />}
        <span className="run-espaco" />
        {existente &&
          (removendo ? (
            <>
              <span className="page-sub">Remover esta atividade?</span>
              <Button variant="danger-solido" label="Remover" onClick={() => (crmRemover('atividades', existente.id), onFechar())} />
              <Button label="Não" onClick={() => setRemovendo(false)} />
            </>
          ) : (
            <Button variant="danger" icon="trash" label="Remover" onClick={() => setRemovendo(true)} />
          ))}
      </div>
    </Janela>
  );
}

const novaAtividade = vencimento => ({
  id: crypto.randomUUID(),
  tipo: 'ligacao',
  titulo: '',
  descricao: null,
  vencimento,
  concluida: false,
  concluidaEm: null,
  empresaId: null,
  negocioId: null,
  lote: null,
  quantidadeKg: null
});

/* ---------- Page ---------- */

export function CrmCalendario() {
  const {crm, crmSalvar, notify} = useStore();
  const hoje = today();
  const [visao, setVisao] = useState('mes');
  const [referencia, setReferencia] = useState(hoje);
  const [selecionado, setSelecionado] = useState(hoje);
  const [tipos, setTipos] = useState(() => new Set(ORDEM_TIPOS.filter(t => t !== 'nota')));
  const [situacao, setSituacao] = useState('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(null);
  const [negocio, setNegocio] = useState(null);

  const q = busca.trim().toUpperCase();
  const lista = useMemo(
    () =>
      crm.atividades.filter(a => {
        if (!tipos.has(a.tipo)) return false;
        if (situacao === 'pendentes' && a.concluida) return false;
        if (situacao === 'atrasadas' && !atrasada(a)) return false;
        if (situacao === 'concluidas' && !a.concluida) return false;
        if (!q) return true;
        const empresa = crm.empresas.find(e => e.id === a.empresaId)?.nome;
        const neg = crm.negocios.find(n => n.id === a.negocioId)?.titulo;
        return [a.titulo, a.descricao, empresa, neg].some(t => t?.toUpperCase().includes(q));
      }),
    [crm, tipos, situacao, q]
  );
  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const a of lista) {
      if (!a.vencimento) continue;
      mapa.set(a.vencimento, [...(mapa.get(a.vencimento) ?? []), a]);
    }
    for (const l of mapa.values()) l.sort(ordemNoDia);
    return mapa;
  }, [lista]);

  const abertas = crm.atividades.filter(a => !a.concluida && a.tipo !== 'nota');
  const iniSemana = inicioDaSemana(hoje);
  const resumo = [
    {rotulo: 'Atrasadas', n: abertas.filter(atrasada).length, cor: 'var(--stop)'},
    {rotulo: 'Hoje', n: abertas.filter(a => a.vencimento === hoje).length, cor: 'var(--accent)'},
    {rotulo: 'Esta semana', n: abertas.filter(a => a.vencimento >= iniSemana && a.vencimento <= somaDias(iniSemana, 6)).length},
    {rotulo: 'Sem data', n: abertas.filter(a => !a.vencimento).length}
  ];
  const semTarefa = crm.negocios.filter(n => n.situacao === 'aberto' && proximoPasso(n, crm.atividades).estado === 'nenhum');

  const andar = n => {
    if (visao === 'mes') setReferencia(r => somaMeses(r, n));
    else setReferencia(r => somaDias(r, n * (visao === 'semana' ? 7 : 30)));
  };
  const titulo =
    visao === 'mes'
      ? `${maiuscula(MESES[paraData(referencia).getMonth()])} ${paraData(referencia).getFullYear()}`
      : visao === 'semana'
        ? `${diaCurto(inicioDaSemana(referencia))} – ${diaCurto(somaDias(inicioDaSemana(referencia), 6))} ${paraData(somaDias(inicioDaSemana(referencia), 6)).getFullYear()}`
        : situacao === 'concluidas'
          ? `Até ${diaCurto(referencia)}`
          : `A partir de ${diaCurto(referencia)}`;
  const irPara = dia => {
    setReferencia(dia);
    setSelecionado(dia);
  };
  const mover = (id, dia) => {
    const a = crm.atividades.find(x => x.id === id);
    if (!a || a.vencimento === dia || a.concluida) return;
    crmSalvar('atividades', {...a, vencimento: dia});
    notify({status: 'Atividade remarcada', title: a.titulo, detail: `Para ${diaLongo(dia)}`, icon: 'check'});
  };
  // Late ones can be months back, out of the grid: the agenda lists them all in one place.
  const mudarSituacao = nova => {
    setSituacao(nova);
    if (nova === 'atrasadas') setVisao('agenda');
  };
  const alternarTipo = t => setTipos(s => {
    const n = new Set(s);
    n.has(t) ? n.delete(t) : n.add(t);
    return n;
  });
  const props = {referencia, porDia, selecionado, onSelecionar: setSelecionado, onNova: dia => setAberta(novaAtividade(dia)), onAbrir: setAberta, onMover: mover};

  return (
    <main className="page cal-pagina">
      <div className="page-head">
        <div>
          <h1 className="page-title">Atividades</h1>
          <p className="page-sub">O calendário do comercial: clique num dia para ver, dê dois cliques para criar, arraste para remarcar.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" label="Nova atividade" onClick={() => setAberta(novaAtividade(selecionado ?? hoje))} />
        </div>
      </div>

      <section className="cal-resumo">
        {resumo.map(r =>
          r.rotulo === 'Atrasadas' ? (
            <button key={r.rotulo} type="button" className={`cal-resumo-item clicavel ${situacao === 'atrasadas' ? 'on' : ''}`} style={{'--c': r.cor}} onClick={() => mudarSituacao(situacao === 'atrasadas' ? 'todas' : 'atrasadas')} title={situacao === 'atrasadas' ? 'Mostrar todas' : 'Ver só as atrasadas'}>
              <span>{r.rotulo}</span>
              <b style={r.n ? {color: r.cor} : null}>{r.n}</b>
            </button>
          ) : (
            <div key={r.rotulo} className="cal-resumo-item" style={{'--c': r.cor}}>
              <span>{r.rotulo}</span>
              <b style={r.n && r.cor ? {color: r.cor} : null}>{r.n}</b>
            </div>
          )
        )}
      </section>

      {semTarefa.length > 0 && (
        <div className="sem-rota">
          <b>
            {semTarefa.length} {semTarefa.length === 1 ? 'negócio sem' : 'negócios sem'} tarefa agendada:
          </b>{' '}
          {semTarefa.slice(0, 5).map((n, i) => (
            <span key={n.id}>
              {i > 0 ? ', ' : ''}
              <button type="button" className="trail-link" onClick={() => setNegocio(n)}>
                {n.titulo}
              </button>
            </span>
          ))}
          {semTarefa.length > 5 ? '…' : ''}
        </div>
      )}

      <div className="cal-corpo">
        <aside className="cal-lateral">
          <MiniCalendario referencia={referencia} selecionado={selecionado} comAtividade={new Set(porDia.keys())} onEscolher={irPara} />
          <label className="search cal-busca">
            <Icon name="search" size={16} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar atividade, empresa…" aria-label="Buscar atividade" />
          </label>
          <div className="cal-filtros">
            <span className="label">Tipos</span>
            {ORDEM_TIPOS.map(t => (
              <label key={t} className="cal-filtro">
                <input type="checkbox" checked={tipos.has(t)} onChange={() => alternarTipo(t)} />
                <i style={{background: CORES_TIPO[t]}} />
                {t === 'nota' ? 'Anotações' : TIPOS_ATIVIDADE[t]}
              </label>
            ))}
            <span className="label cal-filtro-sep">Situação</span>
            {Object.entries(SITUACOES).map(([id, rotulo]) => (
              <label key={id} className="cal-filtro">
                <input type="radio" name="cal-situacao" checked={situacao === id} onChange={() => mudarSituacao(id)} />
                {rotulo}
              </label>
            ))}
          </div>
        </aside>

        <section className="cal-principal">
          <div className="cal-barra">
            <Button size="sm" label="Hoje" onClick={() => irPara(hoje)} />
            <button type="button" className="cal-seta grande" aria-label="Anterior" onClick={() => andar(-1)}>
              ‹
            </button>
            <button type="button" className="cal-seta grande" aria-label="Próximo" onClick={() => andar(1)}>
              ›
            </button>
            <h2 className="cal-titulo">{titulo}</h2>
            <div className="cal-visoes" role="tablist">
              {[
                ['mes', 'Mês'],
                ['semana', 'Semana'],
                ['agenda', 'Agenda']
              ].map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={visao === id} className={visao === id ? 'on' : ''} onClick={() => setVisao(id)}>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          {situacao !== 'todas' && (
            <div className={`cal-aviso-filtro ${situacao}`}>
              <span>
                Mostrando só as <b>{SITUACOES[situacao].toLowerCase()}</b>
                {situacao === 'atrasadas' ? ` (${resumo[0].n}). Abra para mudar a data ou concluir; no Mês e na Semana também dá para arrastar.` : '.'}
              </span>
              <button type="button" className="trail-link" onClick={() => mudarSituacao('todas')}>
                Ver todas
              </button>
            </div>
          )}
          <div className="cal-area">
            <div className="cal-vista">
              {visao === 'mes' && <VisaoMes {...props} />}
              {visao === 'semana' && <VisaoSemana {...props} />}
              {visao === 'agenda' && <VisaoAgenda referencia={referencia} lista={lista} passado={situacao === 'concluidas'} onAbrir={setAberta} onNova={dia => setAberta(novaAtividade(dia))} />}
            </div>
            {visao !== 'agenda' && selecionado && (
              <PainelDoDia dia={selecionado} lista={porDia.get(selecionado) ?? []} onAbrir={setAberta} onNova={dia => setAberta(novaAtividade(dia))} onFechar={() => setSelecionado(null)} />
            )}
          </div>
        </section>
      </div>

      {aberta && (
        <JanelaAtividade
          key={aberta.id}
          inicial={aberta}
          onFechar={() => setAberta(null)}
          onAbrirNegocio={n => {
            setAberta(null);
            setNegocio(n);
          }}
        />
      )}
      {negocio && <JanelaNegocio key={negocio.id} inicial={negocio} onFechar={() => setNegocio(null)} />}
    </main>
  );
}
