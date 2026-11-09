import {useEffect, useState} from 'react';
import {carregarTudo, mensagemDeErro, supabase} from '../state/banco.js';
import {Button} from './Button.jsx';
import {Logo} from './Logo.jsx';

const TEXTOS = {
  entrar: {titulo: 'Entrar', botao: 'Entrar'},
  senha: {titulo: 'Recuperar senha', botao: 'Enviar link por e-mail'}
};

function Moldura({titulo, children}) {
  return (
    <main className="acesso">
      <section className="panel acesso-caixa">
        <Logo />
        <h1 className="page-title">{titulo}</h1>
        {children}
      </section>
    </main>
  );
}

function Login() {
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async e => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const {error} = await supabase.auth.signInWithPassword({email, password: senha});
        if (error) throw error;
      } else {
        const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: location.origin});
        if (error) throw error;
        setAviso('Se o e-mail estiver cadastrado, o link de recuperação chegará em instantes.');
      }
    } catch (falha) {
      setErro(falha.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : mensagemDeErro(falha));
    }
    setEnviando(false);
  };

  return (
    <Moldura titulo={TEXTOS[modo].titulo}>
      <form className="acesso-form" onSubmit={enviar}>
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {modo !== 'senha' && (
          <label className="field">
            <span>Senha</span>
            <input
              className="input"
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
        )}
        {erro && <p className="wiz-err" role="alert">{erro}</p>}
        {aviso && <p className="acesso-aviso" role="status">{aviso}</p>}
        <button type="submit" className="btn primary lg" disabled={enviando}>
          {enviando ? 'Aguarde…' : TEXTOS[modo].botao}
        </button>
      </form>
      <div className="acesso-links">
        {modo !== 'entrar' && <button type="button" className="trail-link" onClick={() => setModo('entrar')}>Voltar para entrar</button>}
        {modo !== 'senha' && <button type="button" className="trail-link" onClick={() => setModo('senha')}>Esqueci a senha</button>}
      </div>
    </Moldura>
  );
}

function NovaSenha({onPronto}) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const salvar = async e => {
    e.preventDefault();
    const {error} = await supabase.auth.updateUser({password: senha});
    if (error) return setErro(mensagemDeErro(error));
    onPronto();
  };
  return (
    <Moldura titulo="Definir nova senha">
      <form className="acesso-form" onSubmit={salvar}>
        <label className="field">
          <span>Nova senha</span>
          <input className="input" type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        {erro && <p className="wiz-err" role="alert">{erro}</p>}
        <button type="submit" className="btn primary lg">Salvar senha</button>
      </form>
    </Moldura>
  );
}

function SemAcesso({titulo, texto, onTentar}) {
  return (
    <Moldura titulo={titulo}>
      <p className="page-sub">{texto}</p>
      <div className="page-actions">
        {onTentar && <Button variant="primary" label="Tentar de novo" onClick={onTentar} />}
        <Button label="Sair" onClick={() => supabase.auth.signOut()} />
      </div>
    </Moldura>
  );
}

// Decides what to show: login, waiting for a role, or the system with its data already loaded.
export function Acesso({children}) {
  const [sessao, setSessao] = useState(undefined);
  const [novaSenha, setNovaSenha] = useState(false);
  const [carga, setCarga] = useState({estado: 'parado'});
  const usuarioId = sessao?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSessao(data.session));
    const {data} = supabase.auth.onAuthStateChange((evento, atual) => {
      if (evento === 'PASSWORD_RECOVERY') setNovaSenha(true);
      setSessao(atual);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const carregar = async () => {
    setCarga({estado: 'carregando'});
    try {
      const {data: perfil, error} = await supabase.from('perfis').select('id, nome, email, papel').eq('id', usuarioId).maybeSingle();
      if (error) throw error;
      if (!perfil?.papel) return setCarga({estado: 'sem-papel'});
      setCarga({estado: 'pronto', perfil: {id: perfil.id, tipo: perfil.papel, nome: perfil.nome, email: perfil.email}, dados: await carregarTudo(perfil.papel)});
    } catch (falha) {
      setCarga({estado: 'erro', mensagem: mensagemDeErro(falha)});
    }
  };

  useEffect(() => {
    if (usuarioId) carregar();
    else setCarga({estado: 'parado'});
  }, [usuarioId]);

  if (novaSenha && sessao) return <NovaSenha onPronto={() => setNovaSenha(false)} />;
  if (sessao === undefined) return <div className="acesso"><p className="page-sub">Carregando…</p></div>;
  if (!sessao) return <Login />;
  if (carga.estado === 'erro') return <SemAcesso titulo="Não foi possível carregar" texto={carga.mensagem} onTentar={carregar} />;
  if (carga.estado === 'sem-papel')
    return <SemAcesso titulo="Aguardando liberação" texto="Um gerente precisa definir sua função para você acessar o sistema." onTentar={carregar} />;
  if (carga.estado !== 'pronto') return <div className="acesso"><p className="page-sub">Carregando dados…</p></div>;
  return children(carga);
}
