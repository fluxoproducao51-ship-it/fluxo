import {useEffect, useState} from 'react';
import {mensagemDeErro, supabase} from '../state/banco.js';
import {PERFIS} from '../state/perfis.js';
import {useStore} from '../state/store.jsx';
import {Button} from '../ui/Button.jsx';

const VAZIO = {nome: '', email: '', senha: '', papel: ''};

// The login is created on the server, where the admin key lives; the function re-checks that the caller is a manager.
async function criarUsuario(dados) {
  const {data, error} = await supabase.functions.invoke('criar-usuario', {body: dados});
  if (!error) return data;
  const corpo = await error.context?.json?.().catch(() => null);
  throw new Error(corpo?.erro ?? 'Não foi possível criar o usuário. Verifique a conexão.');
}

function NovoUsuario({onCriado}) {
  const {notify} = useStore();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const campo = chave => e => setForm(f => ({...f, [chave]: e.target.value}));
  const enviar = async e => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await criarUsuario(form);
      notify({status: 'Usuário criado', title: form.nome.trim(), detail: `${PERFIS[form.papel].cargo} · já pode entrar`, icon: 'user'});
      setForm(VAZIO);
      onCriado();
    } catch (falha) {
      setErro(falha.message);
    }
    setEnviando(false);
  };
  return (
    <form className="panel" onSubmit={enviar} autoComplete="off">
      <h2 className="section-title">Novo usuário</h2>
      <div className="maq-form">
        <label className="field">
          <span>Nome</span>
          <input className="input" id="novo-nome" value={form.nome} onChange={campo('nome')} required />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input className="input" id="novo-email" type="email" value={form.email} onChange={campo('email')} autoComplete="off" required />
        </label>
        <label className="field">
          <span>Senha inicial</span>
          <input className="input" id="novo-senha" type="password" value={form.senha} onChange={campo('senha')} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>Função</span>
          <select className="input" id="novo-papel" value={form.papel} onChange={campo('papel')} required>
            <option value="">Selecione</option>
            {Object.entries(PERFIS).map(([tipo, p]) => (
              <option key={tipo} value={tipo}>
                {p.cargo}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" icon="plus" label={enviando ? 'Criando…' : 'Criar usuário'} disabled={enviando} />
      </div>
      {erro && <p className="wiz-err" role="alert" style={{marginTop: 8}}>{erro}</p>}
      <p className="wiz-note">A senha inicial precisa ter pelo menos 8 caracteres. Passe-a para a pessoa, que entra direto, sem confirmar e-mail.</p>
    </form>
  );
}

export function Usuarios() {
  const {perfil, notify} = useStore();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = async () => {
    const {data, error} = await supabase.from('perfis').select('id, nome, email, papel, criado_em').order('criado_em');
    if (error) return setErro(mensagemDeErro(error));
    setLista(data);
  };
  useEffect(() => {
    carregar();
  }, []);

  const mudar = async (usuario, papel) => {
    const {error} = await supabase.from('perfis').update({papel: papel || null}).eq('id', usuario.id);
    if (error) notify({status: 'Não foi possível alterar', title: usuario.nome, detail: error.message.includes('gerente') ? 'O sistema precisa de pelo menos um gerente.' : mensagemDeErro(error), icon: 'alert'});
    else notify({status: 'Função alterada', title: usuario.nome, detail: papel ? PERFIS[papel].cargo : 'Sem acesso', icon: 'user'});
    carregar();
  };

  const pendentes = lista?.filter(u => !u.papel).length ?? 0;
  return (
    <main className="page">
      <div>
        <h1 className="page-title">Usuários</h1>
        <p className="page-sub">Crie os acessos da equipe e defina o que cada pessoa pode ver.</p>
      </div>
      <NovoUsuario onCriado={carregar} />
      {pendentes > 0 && <div className="sem-rota"><b>{pendentes} {pendentes === 1 ? 'conta aguardando' : 'contas aguardando'} liberação.</b></div>}
      {erro && <p className="wiz-err">{erro}</p>}
      <div className="dtable-wrap">
        <table className="dtable sem-hover">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Função</th>
            </tr>
          </thead>
          <tbody>
            {lista?.map(u => (
              <tr key={u.id}>
                <td style={{fontWeight: 500}}>
                  {u.nome}
                  {u.id === perfil.id ? ' (você)' : ''}
                </td>
                <td>{u.email}</td>
                <td>
                  <select className="input usuario-papel" aria-label={`Função de ${u.nome}`} value={u.papel ?? ''} onChange={e => mudar(u, e.target.value)}>
                    <option value="">Sem acesso</option>
                    {Object.entries(PERFIS).map(([tipo, p]) => (
                      <option key={tipo} value={tipo}>
                        {p.cargo}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista && !erro && <div className="empty">Carregando…</div>}
      </div>
    </main>
  );
}
