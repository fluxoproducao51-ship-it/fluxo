import {useMemo, useState} from 'react';
import {useStore} from '../state/store.jsx';
import {GALPOES, title} from '../state/data.js';
import {pausado} from '../state/balance.js';
import {Button} from '../ui/Button.jsx';
import {parseKg} from '../ui/Dialog.jsx';
import {Icon} from '../ui/Icon.jsx';
import {Status} from '../ui/Status.jsx';

const VAZIO = {nome: '', galpao: '', capacidade: ''};
// "EXTRUSAO" and "EXTRUSÃO" are the same machine.
const semAcento = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function Campos({valor, onChange, comNome, onEnter}) {
  const set = key => e => onChange({...valor, [key]: e.target.value});
  const tecla = e => e.key === 'Enter' && onEnter?.();
  return (
    <>
      {comNome && (
        <label className="field maq-nome">
          <span>Nome da máquina</span>
          <input className="input" value={valor.nome} onChange={set('nome')} onKeyDown={tecla} placeholder="Ex.: Extrusora 2" autoFocus />
        </label>
      )}
      <label className="field">
        <span>Galpão</span>
        <select className="input" value={valor.galpao} onChange={set('galpao')}>
          <option value="">Não informado</option>
          {GALPOES.map(g => (
            <option key={g} value={g}>
              {title(g)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Capacidade (kg/h)</span>
        <input className="input" inputMode="numeric" value={valor.capacidade} onChange={set('capacidade')} onKeyDown={tecla} placeholder="Opcional" />
      </label>
    </>
  );
}

export function Maquinas() {
  const {cadastros, abertos, cadastro, salvarMaquina, notify} = useStore();
  const [nova, setNova] = useState(VAZIO);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);

  const q = busca.trim().toUpperCase();
  const lista = useMemo(
    () => [...cadastros.processos].filter(m => semAcento(m.nome).includes(semAcento(q))).sort((a, b) => b.ativo - a.ativo || a.nome.localeCompare(b.nome)),
    [cadastros.processos, q]
  );

  const adicionar = () => {
    const nome = nova.nome.trim().toUpperCase();
    if (!nome) return setErro('Informe o nome da máquina.');
    const repetida = cadastros.processos.find(m => semAcento(m.nome) === semAcento(nome));
    if (repetida) return setErro(`${title(repetida.nome)} já está cadastrada.`);
    salvarMaquina({nome, ativo: true, galpao: nova.galpao || null, capacidade: parseKg(nova.capacidade)});
    notify({status: 'Máquina cadastrada', title: title(nome), detail: 'Já pode entrar nas rotas', icon: 'plus'});
    setNova(VAZIO);
    setErro(null);
  };

  const salvarEdicao = () => {
    salvarMaquina({nome: editando.nome, galpao: editando.galpao || null, capacidade: parseKg(editando.capacidade)});
    setEditando(null);
  };

  return (
    <main className="page">
      <div>
        <h1 className="page-title">Máquinas</h1>
        <p className="page-sub">As máquinas cadastradas aqui aparecem nas rotas e no lançamento de produção.</p>
      </div>

      <section className="panel">
        <h2 className="section-title">Nova máquina</h2>
        <div className="maq-form">
          <Campos valor={nova} onChange={setNova} comNome onEnter={adicionar} />
          <Button variant="primary" icon="plus" label="Cadastrar" onClick={adicionar} />
        </div>
        {erro && <p className="wiz-err" style={{margin: '8px 0 0'}}>{erro}</p>}
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">{cadastros.processos.filter(m => m.ativo).length} máquinas ativas</h2>
          <label className="search" style={{maxWidth: 240}}>
            <Icon name="search" size={16} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar máquina" aria-label="Buscar máquina" />
          </label>
        </div>
        <div className="dtable-wrap">
          <table className="dtable sem-hover maq-tabela">
            <thead>
              <tr>
                <th>Máquina</th>
                <th>Galpão</th>
                <th className="n">Capacidade</th>
                <th className="n">Rotas</th>
                <th>Agora</th>
                <th>Ativa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map(m => {
                const procs = abertos.filter(p => p.setor === m.nome);
                const rotas = cadastros.rotas.filter(r => r.etapas.includes(m.nome)).length;
                if (editando?.nome === m.nome)
                  return (
                    <tr key={m.nome} className="maq-editando">
                      <td colSpan={7}>
                        <div className="maq-form">
                          <b className="maq-editando-nome">{title(m.nome)}</b>
                          <Campos valor={editando} onChange={setEditando} onEnter={salvarEdicao} />
                          <Button variant="primary" icon="check" label="Salvar" onClick={salvarEdicao} />
                          <Button variant="ghost" label="Cancelar" onClick={() => setEditando(null)} />
                        </div>
                      </td>
                    </tr>
                  );
                return (
                  <tr key={m.nome} className={m.ativo ? '' : 'maq-inativa'}>
                    <td style={{fontWeight: 500}}>{title(m.nome)}</td>
                    <td>{m.galpao ? title(m.galpao) : '—'}</td>
                    <td className="n">{m.capacidade ? `${m.capacidade.toLocaleString('pt-BR')} kg/h` : '—'}</td>
                    <td className="n">{rotas}</td>
                    <td>
                      {procs.some(pausado) ? (
                        <Status value="PARADO" short />
                      ) : procs.length ? (
                        <Status value="EM PROCESSO" short />
                      ) : (
                        <span className="maq-livre">Livre</span>
                      )}
                    </td>
                    <td>
                      <label className="toggle small" title={m.ativo ? 'Ativa' : 'Inativa'}>
                        <input
                          type="checkbox"
                          aria-label={`${m.ativo ? 'Desativar' : 'Ativar'} ${title(m.nome)}`}
                          checked={m.ativo}
                          onChange={() => cadastro('processos', 'toggle', m.nome)}
                        />
                        <span className="toggle-track">
                          <span className="toggle-thumb" />
                        </span>
                      </label>
                    </td>
                    <td style={{textAlign: 'right'}}>
                      <Button
                        size="sm"
                        label="Editar"
                        onClick={() => setEditando({nome: m.nome, galpao: m.galpao ?? '', capacidade: m.capacidade ? String(m.capacidade) : ''})}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lista.length && <div className="empty">Nenhuma máquina encontrada.</div>}
        </div>
        <p className="wiz-note">Máquina inativa sai da lista de novas rotas. Rotas e lotes que já passam por ela não mudam.</p>
      </section>
    </main>
  );
}
