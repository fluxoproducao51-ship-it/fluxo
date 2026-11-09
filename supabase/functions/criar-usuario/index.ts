// Creates a login for a new employee. Only a signed-in manager gets past the checks below;
// the service key stays here on the server and never reaches the browser.
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';

const PAPEIS = ['gerente', 'pcp', 'logistica', 'producao'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {status, headers: {...CORS, 'Content-Type': 'application/json'}});

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS});
  if (req.method !== 'POST') return resposta({erro: 'Método não permitido.'}, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: {persistSession: false, autoRefreshToken: false}
  });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const {data: quem, error: erroToken} = token ? await admin.auth.getUser(token) : {data: {user: null}, error: true};
  if (erroToken || !quem.user) return resposta({erro: 'Sessão inválida. Entre novamente.'}, 401);

  const {data: perfil} = await admin.from('perfis').select('papel').eq('id', quem.user.id).maybeSingle();
  if (perfil?.papel !== 'gerente') return resposta({erro: 'Apenas o gerente pode criar usuários.'}, 403);

  let dados: {nome?: unknown; email?: unknown; senha?: unknown; papel?: unknown};
  try {
    dados = await req.json();
  } catch {
    return resposta({erro: 'Dados inválidos.'}, 400);
  }
  const nome = String(dados.nome ?? '').trim();
  const email = String(dados.email ?? '').trim().toLowerCase();
  const senha = String(dados.senha ?? '');
  const papel = String(dados.papel ?? '');
  if (!nome) return resposta({erro: 'Informe o nome.'}, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta({erro: 'Informe um e-mail válido.'}, 400);
  if (senha.length < 8) return resposta({erro: 'A senha precisa ter pelo menos 8 caracteres.'}, 400);
  if (!PAPEIS.includes(papel)) return resposta({erro: 'Escolha a função do usuário.'}, 400);

  const {data: criado, error} = await admin.auth.admin.createUser({email, password: senha, email_confirm: true, user_metadata: {nome}});
  if (error) {
    const repetido = error.code === 'email_exists' || /already/i.test(error.message);
    const fraca = error.code === 'weak_password';
    return resposta({erro: repetido ? 'Já existe um usuário com esse e-mail.' : fraca ? 'Essa senha é fraca demais. Escolha outra.' : 'Não foi possível criar o usuário.'}, repetido ? 409 : 400);
  }

  // The database trigger already created the profile, without a role.
  const {error: erroPapel} = await admin.from('perfis').update({papel, nome}).eq('id', criado.user.id);
  if (erroPapel) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return resposta({erro: 'Não foi possível definir a função. O usuário não foi criado.'}, 500);
  }
  return resposta({id: criado.user.id, nome, email, papel}, 201);
});
