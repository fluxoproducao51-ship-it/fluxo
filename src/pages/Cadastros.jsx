import {useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {title} from '../state/data.js';
import {Button} from '../ui/Button.jsx';
import {Icon} from '../ui/Icon.jsx';
import {Chips} from './Producao.jsx';
import {RotaEditor} from '../ui/RotaEditor.jsx';

const LISTAS = [
  {value: 'rotas', label: 'Rotas', hint: 'Sequência de máquinas de cada material.'},
  {value: 'materiais', label: 'Matéria-prima', hint: 'Materiais aceitos no recebimento e na separação.'},
  {value: 'clientes', label: 'Clientes', hint: 'Origem do material e destino dos envios.'},
  {value: 'cores', label: 'Cores', hint: 'Cor do material no recebimento.'}
];

export function Cadastros() {
  const {cadastros} = useStore();
  const [lista, setLista] = useState('rotas');
  return (
    <main className="page" style={{gap: 28}}>
      <div>
        <h1 className="page-title">Cadastros</h1>
        <p className="page-sub">Listas padronizadas usadas no recebimento, nos apontamentos e nos envios.</p>
      </div>
      <Chips
        id="cad-pill"
        value={lista}
        onChange={setLista}
        options={LISTAS.map(l => ({value: l.value, label: `${l.label} · ${cadastros[l.value].length}`}))}
      />
      {lista === 'rotas' ? (
        <Rotas />
      ) : (
        <ListaCadastro key={lista} lista={lista} />
      )}
    </main>
  );
}

function ListaCadastro({lista}) {
  const {cadastros, cadastro, notify} = useStore();
  const [removendo, setRemovendo] = useState(null);
  const [novo, setNovo] = useState('');
  const [busca, setBusca] = useState('');
  const atual = LISTAS.find(l => l.value === lista);
  const itens = cadastros[lista].filter(i => i.nome.includes(busca.trim().toUpperCase()));
  const add = () => {
    const nome = novo.trim().toUpperCase();
    if (!nome) return;
    cadastro(lista, 'add', nome);
    notify({status: `${atual.label} · adicionado`, title: title(nome), icon: 'plus'});
    setNovo('');
  };
  return (
    <section className="panel">
      <div style={{display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end'}}>
        <div>
          <h2 className="section-title">{atual.label}</h2>
          <p className="page-sub" style={{fontSize: 14}}>{atual.hint} Itens inativos somem das listas, mas o histórico continua.</p>
        </div>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          <label className="search" style={{height: 40, maxWidth: 220}}>
            <Icon name="search" size={16} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar" />
          </label>
          <input
            className="input"
            style={{height: 40, width: 220}}
            value={novo}
            onChange={e => setNovo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder={`Novo em ${atual.label.toLowerCase()}`}
          />
          <Button variant="primary" icon="plus" label="Adicionar" onClick={add} />
        </div>
      </div>
      <div className="cad-grid">
        <AnimatePresence initial={false}>
          {itens.map(i => (
            <motion.div key={i.nome} layout className={`cad-item ${i.ativo ? '' : 'off'}`} initial={{opacity: 0, scale: 0.96}} animate={{opacity: 1, scale: 1}}>
              <span className="cut">{title(i.nome)}</span>
              <label className="toggle small" title={i.ativo ? 'Ativo' : 'Inativo'}>
                <input type="checkbox" checked={i.ativo} onChange={() => cadastro(lista, 'toggle', i.nome)} />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
              </label>
              {lista === 'cores' && (
                removendo === i.nome ? (
                  <span className="cad-confirma">
                    <Button
                      variant="danger-solido"
                      size="sm"
                      label="Excluir"
                      onClick={() => {
                        cadastro('cores', 'remover', i.nome);
                        setRemovendo(null);
                        notify({status: 'Cor excluída', title: title(i.nome), icon: 'trash'});
                      }}
                    />
                    <Button size="sm" label="Não" onClick={() => setRemovendo(null)} />
                  </span>
                ) : (
                  <button type="button" className="no-x" aria-label={`Excluir ${title(i.nome)}`} title="Excluir" onClick={() => setRemovendo(i.nome)}>
                    <Icon name="trash" size={14} />
                  </button>
                )
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {!itens.length && <div className="empty">Nada encontrado.</div>}
      </div>
    </section>
  );
}

function Rotas() {
  const {cadastros, salvarRota, removerRota, ativos, notify} = useStore();
  const [editando, setEditando] = useState(null);
  const [removendo, setRemovendo] = useState(null);
  const nova = () => setEditando({id: `rota-${Date.now()}`, nome: '', palavras: [], materiais: [], etapas: [], ativo: true, nova: true});
  const ligados = new Set(cadastros.rotas.flatMap(r => r.materiais));
  const semRota = ativos('materiais').filter(m => !ligados.has(m));
  return (
    <section style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap'}}>
        <p className="page-sub" style={{fontSize: 14, maxWidth: 680, margin: 0}}>
          Cada material fica ligado a uma rota. A logística só recebe materiais ligados a uma rota ativa, e o lote já nasce com ela.
          Mudar uma rota vale para os próximos lotes; os lotes que já estão na fábrica mantêm a rota que receberam.
        </p>
        <Button variant="primary" icon="plus" label="Nova rota" onClick={nova} />
      </div>
      {semRota.length > 0 && (
        <div className="sem-rota">
          <b>
            {semRota.length} {semRota.length === 1 ? 'material sem rota' : 'materiais sem rota'}
          </b>{' '}
          A logística não consegue receber até serem ligados a uma rota.
          <div className="rota-words">
            {semRota.map(m => (
              <span key={m} className="tag">{title(m)}</span>
            ))}
          </div>
        </div>
      )}
      <div className="rota-grid">
        {[...cadastros.rotas, ...(editando?.nova ? [editando] : [])].map(r =>
          editando?.id === r.id ? (
            <RotaForm
              key={r.id}
              rota={editando}
              processos={ativos('processos')}
              onCancel={() => setEditando(null)}
              onSave={rota => {
                const {nova: _nova, ...limpa} = rota;
                salvarRota(limpa);
                setEditando(null);
                notify({status: 'Rota salva', title: title(rota.nome), detail: `${rota.materiais.length} materiais · ${rota.etapas.map(title).join(' → ')}`, icon: 'check'});
              }}
            />
          ) : (
            <motion.div key={r.id} layout className={`rota-card ${r.ativo ? '' : 'off'}`}>
              <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start'}}>
                <div style={{minWidth: 0}}>
                  <div style={{fontWeight: 600, fontSize: 17}}>{title(r.nome)}</div>
                  <div className="rota-words">
                    {r.materiais.map(m => (
                      <span key={m} className="tag">{title(m)}</span>
                    ))}
                    {!r.materiais.length && <span className="rota-sem">Nenhum material ligado</span>}
                  </div>
                </div>
                <label className="toggle small" title={r.ativo ? 'Ativa' : 'Inativa'}>
                  <input type="checkbox" checked={r.ativo} onChange={() => salvarRota({...r, ativo: !r.ativo})} />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </label>
              </div>
              <ol className="rota-flow">
                {r.etapas.map((e, i) => (
                  <li key={i}>
                    <span className="rota-n">{i + 1}</span>
                    {title(e)}
                  </li>
                ))}
                <li className="end">
                  <span className="rota-n">
                    <Icon name="truck" size={11} />
                  </span>
                  Estoque
                </li>
              </ol>
              {removendo === r.id ? (
                <div className="rota-remover">
                  <p>
                    Remover a rota {title(r.nome)}?{' '}
                    {r.materiais.length > 0 && `${r.materiais.length} ${r.materiais.length === 1 ? 'material fica' : 'materiais ficam'} sem rota e a logística não poderá recebê-los. `}
                    Os lotes que já estão na fábrica não mudam.
                  </p>
                  <div style={{display: 'flex', gap: 8}}>
                    <Button
                      variant="danger-solido"
                      size="sm"
                      icon="trash"
                      label="Sim, remover"
                      onClick={() => {
                        removerRota(r.id);
                        setRemovendo(null);
                        notify({status: 'Rota removida', title: title(r.nome), icon: 'trash'});
                      }}
                    />
                    <Button size="sm" label="Não" onClick={() => setRemovendo(null)} />
                  </div>
                </div>
              ) : (
                <div className="rota-acoes">
                  <Button
                    size="sm"
                    label="Editar"
                    onClick={() => {
                      setRemovendo(null);
                      setEditando({...r});
                    }}
                  />
                  <Button variant="danger" size="sm" icon="trash" label="Remover" onClick={() => setRemovendo(r.id)} />
                </div>
              )}
            </motion.div>
          )
        )}
      </div>
    </section>
  );
}

function LigarMateriais({rota, selecionados, onChange}) {
  const {cadastros, ativos, cadastro} = useStore();
  const [busca, setBusca] = useState('');
  const q = busca.trim().toUpperCase();
  const donoDe = nome => cadastros.rotas.find(r => r.id !== rota.id && r.materiais.includes(nome));
  const lista = ativos('materiais').filter(m => m.includes(q)).sort();
  const alterna = nome => onChange(selecionados.includes(nome) ? selecionados.filter(m => m !== nome) : [...selecionados, nome]);
  const novo = q && !cadastros.materiais.some(m => m.nome === q);
  return (
    <div className="field">
      <span>Materiais desta rota ({selecionados.length})</span>
      {selecionados.length > 0 && (
        <div className="rota-words" style={{marginTop: 0}}>
          {selecionados.map(m => (
            <button key={m} type="button" className="mat-ligado" onClick={() => alterna(m)} aria-label={`Tirar ${title(m)} da rota`}>
              {title(m)} <Icon name="x" size={11} stroke={2.6} />
            </button>
          ))}
        </div>
      )}
      <label className="search" style={{maxWidth: 'none', flex: 'none'}}>
        <Icon name="search" size={16} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar ou cadastrar material" aria-label="Buscar material" />
      </label>
      {novo && (
        <Button
          size="sm"
          icon="plus"
          label={`Cadastrar e ligar "${title(q)}"`}
          onClick={() => {
            cadastro('materiais', 'add', q);
            onChange([...selecionados, q]);
            setBusca('');
          }}
        />
      )}
      <div className="mat-lista">
        {lista.map(m => {
          const dono = donoDe(m);
          return (
            <label key={m} className="check mat-opcao">
              <input type="checkbox" checked={selecionados.includes(m)} onChange={() => alterna(m)} />
              <span className="cut">{title(m)}</span>
              {dono && <small>{selecionados.includes(m) ? `sai de ${title(dono.nome)}` : `em ${title(dono.nome)}`}</small>}
            </label>
          );
        })}
        {!lista.length && <div className="empty" style={{padding: 8}}>Nenhum material encontrado.</div>}
      </div>
    </div>
  );
}

function RotaForm({rota, processos, onSave, onCancel}) {
  const [r, setR] = useState(rota);
  const valida = r.nome.trim() && r.etapas.length && r.materiais.length;
  const falta = [!r.nome.trim() && 'nome', !r.etapas.length && 'máquinas', !r.materiais.length && 'pelo menos um material'].filter(Boolean);
  return (
    <motion.div layout className="rota-card editing" initial={{opacity: 0, y: 6}} animate={{opacity: 1, y: 0}}>
      <label className="field">
        <span>Nome da rota</span>
        <input className="input" value={r.nome} onChange={e => setR({...r, nome: e.target.value})} placeholder="Ex.: PS branco" autoFocus />
      </label>
      <LigarMateriais rota={r} selecionados={r.materiais} onChange={materiais => setR({...r, materiais})} />
      <div className="field">
        <span>Máquinas, em ordem</span>
        <RotaEditor etapas={r.etapas} onChange={etapas => setR({...r, etapas})} processos={processos} />
      </div>
      {falta.length > 0 && <p className="wiz-note" style={{margin: 0}}>Falta: {falta.join(', ')}.</p>}
      <div style={{display: 'flex', gap: 8}}>
        <Button variant="primary" icon="check" label="Salvar rota" disabled={!valida} onClick={() => onSave({...r, nome: r.nome.trim().toUpperCase()})} />
        <Button variant="ghost" label="Cancelar" onClick={onCancel} />
      </div>
    </motion.div>
  );
}

export function RotasPagina() {
  return (
    <main className="page">
      <div>
        <h1 className="page-title">Rotas</h1>
        <p className="page-sub">A sequência de máquinas de cada material e o que a logística pode receber.</p>
      </div>
      <Rotas />
    </main>
  );
}

export function MateriaisPagina() {
  return (
    <main className="page">
      <div>
        <h1 className="page-title">Materiais</h1>
        <p className="page-sub">Cadastre os materiais aqui e depois ligue cada um a uma rota para a logística poder receber.</p>
      </div>
      <ListaCadastro lista="materiais" />
    </main>
  );
}
