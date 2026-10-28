import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, getToken, setToken } from './api';
import iconeTarefas from '../../imgs/tarefas.png';
import iconeAprovacoes from '../../imgs/aprovacoes.png';
import iconeRecompensas from '../../imgs/recompensas.png';
import iconeNotificacoes from '../../imgs/notificacoes.png';
import iconeCasa from '../../imgs/casa.png';
import iconeTarefaCard from '../../imgs/tarefa.png';
import iconePresente from '../../imgs/presente.png';

type Role = 'RESPONSAVEL' | 'ADOLESCENTE';
type Status = 'PENDENTE' | 'AGUARDANDO_APROVACAO' | 'APROVADA';

interface User {
  id: number;
  householdId: number;
  name: string;
  email: string;
  role: Role;
  xp: number;
}

interface Task {
  id: number;
  title: string;
  xp: number;
  status: Status;
  assigneeId: number;
  assigneeName: string;
  description: string | null;
}

interface Reward {
  id: number;
  title: string;
  cost: number;
}

interface Member {
  id: number;
  name: string;
  role: Role;
  xp: number;
}

interface Atividade {
  id: number;
  kind: 'TAREFA_CONCLUIDA' | 'RECOMPENSA_RESGATADA' | 'NOVA_TAREFA';
  title: string;
  amount: number;
  description: string | null;
  read: number;
  createdAt: string;
  actorName: string;
}

// Nomes mostrados na tela. Os valores internos (RESPONSAVEL/ADOLESCENTE) não mudam.
const roleLabel = (role: Role) => (role === 'RESPONSAVEL' ? 'Administrador' : 'Usuário');
const statusLabel: Record<Status, string> = {
  PENDENTE: 'Pendente',
  AGUARDANDO_APROVACAO: 'Em análise',
  APROVADA: 'Aprovada',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setCarregando(false);
      return;
    }
    api<{ user: User }>('GET', '/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <div className="centro">Carregando...</div>;
  if (!user) return <AuthScreen onEntrar={setUser} />;
  return <Principal user={user} onAtualizarUser={setUser} onSair={() => { setToken(null); setUser(null); }} />;
}

function AuthScreen({ onEntrar }: { onEntrar: (u: User) => void }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('RESPONSAVEL');
  const [inviteCode, setInviteCode] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r =
        modo === 'entrar'
          ? await api<{ token: string; user: User }>('POST', '/auth/login', { email, password })
          : await api<{ token: string; user: User }>('POST', '/auth/signup', {
              name, email, password, role, inviteCode,
            });
      setToken(r.token);
      onEntrar(r.user);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível conectar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth">
      <img src="/icons/logo-splash.png" alt="CasaXP" className="logo-login" />
      <p className="sub">Tarefas da casa viram XP. XP vira recompensa.</p>

      <div className="abas">
        <button className={modo === 'entrar' ? 'ativa' : ''} onClick={() => setModo('entrar')}>Entrar</button>
        <button className={modo === 'criar' ? 'ativa' : ''} onClick={() => setModo('criar')}>Criar conta</button>
      </div>

      <form onSubmit={enviar} className="card">
        {modo === 'criar' && (
          <>
            <label>Seu nome
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </label>
            <label>Você é
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="RESPONSAVEL">Administrador (cria a casa)</option>
                <option value="ADOLESCENTE">Usuário (entra com código)</option>
              </select>
            </label>
            {role === 'ADOLESCENTE' && (
              <label>Código de convite
                <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
                <small>Peça o código ao Administrador da casa.</small>
              </label>
            )}
          </>
        )}
        <label>E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={enviando}>
          {enviando ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </div>
  );
}

type Aba = 'tarefas' | 'aprovacoes' | 'recompensas' | 'atualizacoes' | 'casa';

function Principal({
  user,
  onAtualizarUser,
  onSair,
}: {
  user: User;
  onAtualizarUser: (u: User) => void;
  onSair: () => void;
}) {
  const ehAdmin = user.role === 'RESPONSAVEL';
  const [aba, setAba] = useState<Aba>('tarefas');
  const [naoLidas, setNaoLidas] = useState(0);
  const [aviso, setAviso] = useState('');
  const ultimoTotal = useRef<number | null>(null);

  async function verificarNovidades() {
    const r = await api<{ unread: number }>('GET', '/activities');
    // Mostra a faixa só quando aparece algo novo, não na primeira carga.
    if (ultimoTotal.current !== null && r.unread > ultimoTotal.current) {
      const novas = r.unread - ultimoTotal.current;
      setAviso(novas === 1 ? 'Você tem 1 novidade' : `Você tem ${novas} novidades`);
    }
    ultimoTotal.current = r.unread;
    setNaoLidas(r.unread);
  }

  function marcarLidas() {
    ultimoTotal.current = 0;
    setNaoLidas(0);
    setAviso('');
  }

  // Confere novidades ao abrir o app e a cada 30 segundos.
  useEffect(() => {
    verificarNovidades().catch(() => {});
    const timer = setInterval(() => verificarNovidades().catch(() => {}), 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A faixa some sozinha depois de 6 segundos.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(''), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function atualizarXp() {
    const r = await api<{ user: User }>('GET', '/auth/me');
    onAtualizarUser(r.user);
  }

  async function sair() {
    await api('POST', '/auth/logout').catch(() => {});
    onSair();
  }

  const itens: { id: Aba; icone: string; rotulo: string; mostrar: boolean }[] = [
    { id: 'tarefas', icone: iconeTarefas, rotulo: 'Tarefas', mostrar: true },
    { id: 'aprovacoes', icone: iconeAprovacoes, rotulo: 'Aprovações', mostrar: ehAdmin },
    { id: 'recompensas', icone: iconeRecompensas, rotulo: 'Recompensas', mostrar: true },
    { id: 'atualizacoes', icone: iconeNotificacoes, rotulo: 'Notificações', mostrar: true },
    { id: 'casa', icone: iconeCasa, rotulo: 'Casa', mostrar: true },
  ];

  return (
    <div className="app">
      <header>
        <div className="marca">
          <img className="avatar" src="/icons/icon-192.png" alt="CasaXP" />
          <div>
            <div className="saudacao">Olá, {user.name}</div>
            <div className="papel">{roleLabel(user.role)}</div>
          </div>
        </div>
        {!ehAdmin && <div className="xp">⭐ {user.xp} XP</div>}
        <button className="sair" onClick={sair}>Sair</button>
      </header>

      {aviso && (
        <button className="banner" onClick={() => { setAba('atualizacoes'); marcarLidas(); }}>
          🔔 {aviso} · ver agora
        </button>
      )}

      <main>
        {aba === 'tarefas' && <TarefasTab user={user} onMudou={atualizarXp} />}
        {aba === 'aprovacoes' && ehAdmin && <AprovacoesTab onMudou={atualizarXp} />}
        {aba === 'recompensas' && <RecompensasTab user={user} onMudou={atualizarXp} />}
        {aba === 'atualizacoes' && <AtualizacoesTab onLidas={marcarLidas} />}
        {aba === 'casa' && <CasaTab ehAdmin={ehAdmin} />}
      </main>

      <nav>
        {itens.filter((i) => i.mostrar).map((i) => (
          <button
            key={i.id}
            className={aba === i.id ? 'ativa' : ''}
            onClick={() => setAba(i.id)}
          >
            <span className="icone" style={{ WebkitMaskImage: `url(${i.icone})`, maskImage: `url(${i.icone})` }} />
            <span className="rotulo">{i.rotulo}</span>
            {i.id === 'atualizacoes' && naoLidas > 0 && <span className="badge">{naoLidas}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TarefasTab({ user, onMudou }: { user: User; onMudou: () => Promise<void> }) {
  const ehAdmin = user.role === 'RESPONSAVEL';
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [membros, setMembros] = useState<Member[]>([]);
  const [titulo, setTitulo] = useState('');
  const [xp, setXp] = useState(10);
  const [descricao, setDescricao] = useState('');
  const [responsavelId, setResponsavelId] = useState<number | ''>('');
  const [erro, setErro] = useState('');

  async function carregar() {
    const r = await api<{ tasks: Task[] }>('GET', '/tasks');
    setTarefas(r.tasks);
    if (ehAdmin) {
      const casa = await api<{ members: Member[] }>('GET', '/household');
      const usuarios = casa.members.filter((m) => m.role === 'ADOLESCENTE');
      setMembros(usuarios);
      if (usuarios.length && responsavelId === '') setResponsavelId(usuarios[0].id);
    }
  }

  useEffect(() => {
    carregar().catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await api('POST', '/tasks', { title: titulo, xp, assigneeId: responsavelId, description: descricao });
      setTitulo('');
      setDescricao('');
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function concluir(id: number) {
    setErro('');
    try {
      await api('POST', `/tasks/${id}/complete`);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <section>
      <h2>Tarefas</h2>
      <ResumoTarefas tarefas={tarefas} ehAdmin={ehAdmin} />

      {ehAdmin && (
        <form className="card" onSubmit={criar}>
          <h3>Nova tarefa</h3>
          {membros.length === 0 ? (
            <p>Ainda não há usuários na casa. Peça para eles entrarem com o código de convite (aba Casa).</p>
          ) : (
            <>
              <label>Título
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={2} />
              </label>
              <label>Descrição (opcional)
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Ex.: lavar a louça depois do jantar e deixar secar na pia"
                />
              </label>
              <label>XP
                <input type="number" min={1} max={1000} value={xp} onChange={(e) => setXp(Number(e.target.value))} required />
              </label>
              <label>Para quem
                <select value={responsavelId} onChange={(e) => setResponsavelId(Number(e.target.value))}>
                  {membros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <button className="primario">Criar tarefa</button>
            </>
          )}
        </form>
      )}

      {erro && <p className="erro">{erro}</p>}

      {tarefas.length === 0 && <p className="vazio">Nenhuma tarefa ainda.</p>}
      {tarefas.length > 0 && <h3 className="secao">{ehAdmin ? 'Todas as tarefas' : 'Minhas tarefas'}</h3>}
      {tarefas.map((t) => (
        <div className="card tarefa" key={t.id}>
          <div className="icone-circ">
            <span className="icone-mascara" style={{ WebkitMaskImage: `url(${iconeTarefaCard})`, maskImage: `url(${iconeTarefaCard})` }} />
          </div>
          <div className="tarefa-texto">
            <strong>{t.title}</strong>
            <div className="detalhe">{t.xp} XP{ehAdmin && ` · ${t.assigneeName}`}</div>
            {t.description && <p className="orientacao">{t.description}</p>}
            <span className={`chip ${t.status.toLowerCase()}`}>{statusLabel[t.status]}</span>
          </div>
          {!ehAdmin && t.status === 'PENDENTE' && (
            <button className="check" aria-label="Marcar como feita" onClick={() => concluir(t.id)}>✓</button>
          )}
        </div>
      ))}
    </section>
  );
}

function ResumoTarefas({ tarefas, ehAdmin }: { tarefas: Task[]; ehAdmin: boolean }) {
  const total = tarefas.length;
  const enviadas = tarefas.filter((t) => t.status !== 'PENDENTE').length;
  const percentual = total ? Math.round((enviadas / total) * 100) : 0;
  const circunferencia = 2 * Math.PI * 30;
  return (
    <div className="resumo">
      <div>
        <div className="resumo-titulo">{ehAdmin ? 'Tarefas da casa' : 'Suas tarefas'}</div>
        <div className="resumo-num">{enviadas}/{total}</div>
        <div className="resumo-sub">{enviadas === 1 ? '1 enviada' : `${enviadas} enviadas`} para aprovação</div>
      </div>
      <svg width="78" height="78" viewBox="0 0 78 78" className="anel" aria-hidden="true">
        <circle cx="39" cy="39" r="30" className="anel-fundo" />
        <circle
          cx="39" cy="39" r="30" className="anel-valor"
          strokeDasharray={`${(percentual / 100) * circunferencia} ${circunferencia}`}
        />
        <text x="39" y="44" textAnchor="middle" className="anel-texto">{percentual}%</text>
      </svg>
    </div>
  );
}

function AprovacoesTab({ onMudou }: { onMudou: () => Promise<void> }) {
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [erro, setErro] = useState('');

  async function carregar() {
    const r = await api<{ tasks: Task[] }>('GET', '/tasks');
    setTarefas(r.tasks.filter((t) => t.status === 'AGUARDANDO_APROVACAO'));
  }

  useEffect(() => {
    carregar().catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decidir(id: number, acao: 'approve' | 'reject') {
    setErro('');
    try {
      await api('POST', `/tasks/${id}/${acao}`);
      await carregar();
      await onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <section>
      <h2>Aprovações</h2>
      {erro && <p className="erro">{erro}</p>}
      {tarefas.length === 0 && <p className="vazio">Nada aguardando aprovação.</p>}
      {tarefas.map((t) => (
        <div className="card" key={t.id}>
          <strong>{t.title}</strong>
          <div className="detalhe">{t.assigneeName} · {t.xp} XP</div>
          <div className="linha">
            <button className="primario pequeno" onClick={() => decidir(t.id, 'approve')}>Aprovar</button>
            <button className="secundario pequeno" onClick={() => decidir(t.id, 'reject')}>Recusar</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function RecompensasTab({ user, onMudou }: { user: User; onMudou: () => Promise<void> }) {
  const ehAdmin = user.role === 'RESPONSAVEL';
  const [recompensas, setRecompensas] = useState<Reward[]>([]);
  const [titulo, setTitulo] = useState('');
  const [custo, setCusto] = useState(50);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function carregar() {
    const r = await api<{ rewards: Reward[] }>('GET', '/rewards');
    setRecompensas(r.rewards);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await api('POST', '/rewards', { title: titulo, cost: custo });
      setTitulo('');
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function resgatar(id: number) {
    setErro('');
    setAviso('');
    try {
      await api('POST', `/rewards/${id}/redeem`);
      setAviso('Recompensa resgatada!');
      await onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function excluirRecompensa(r: Reward) {
    const confirmou = window.confirm(
      `Excluir a recompensa "${r.title}"? Os resgates antigos dela também serão apagados. Essa ação não pode ser desfeita.`,
    );
    if (!confirmou) return;
    setErro('');
    setAviso('');
    try {
      await api('DELETE', `/rewards/${r.id}`);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <section>
      <h2>Recompensas</h2>

      {ehAdmin && (
        <form className="card" onSubmit={criar}>
          <h3>Nova recompensa</h3>
          <label>Nome
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={2} />
          </label>
          <label>Custo em XP
            <input type="number" min={1} max={10000} value={custo} onChange={(e) => setCusto(Number(e.target.value))} required />
          </label>
          <button className="primario">Criar recompensa</button>
        </form>
      )}

      {erro && <p className="erro">{erro}</p>}
      {aviso && <p className="sucesso">{aviso}</p>}
      {recompensas.length === 0 && <p className="vazio">Nenhuma recompensa ainda.</p>}
      {recompensas.map((r) => (
        <div className="card tarefa" key={r.id}>
          <div className="icone-circ">
            <span className="icone-mascara" style={{ WebkitMaskImage: `url(${iconePresente})`, maskImage: `url(${iconePresente})` }} />
          </div>
          <div className="tarefa-texto">
            <strong>{r.title}</strong>
            <div className="detalhe">{r.cost} XP</div>
          </div>
          {!ehAdmin && (
            <button className="primario pequeno" disabled={user.xp < r.cost} onClick={() => resgatar(r.id)}>
              Resgatar
            </button>
          )}
          {ehAdmin && (
            <button className="perigo pequeno" onClick={() => excluirRecompensa(r)}>Excluir</button>
          )}
        </div>
      ))}
    </section>
  );
}

function CasaTab({ ehAdmin }: { ehAdmin: boolean }) {
  const [casa, setCasa] = useState<{ name: string; inviteCode: string | null; members: Member[] } | null>(null);
  const [erro, setErro] = useState('');

  async function carregar() {
    const r = await api<{ name: string; inviteCode: string | null; members: Member[] }>('GET', '/household');
    setCasa(r);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function excluir(m: Member) {
    const confirmou = window.confirm(
      `Excluir ${m.name}? As tarefas, o XP e o histórico dessa pessoa serão apagados. Essa ação não pode ser desfeita.`,
    );
    if (!confirmou) return;
    setErro('');
    try {
      await api('DELETE', `/household/members/${m.id}`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  }

  if (!casa) return erro ? <p className="erro">{erro}</p> : <p>Carregando...</p>;

  return (
    <section>
      <h2>{casa.name}</h2>
      {ehAdmin && casa.inviteCode && (
        <div className="card">
          <h3>Código de convite</h3>
          <p className="codigo">{casa.inviteCode}</p>
          <small>Use este código para o usuário criar a conta dele.</small>
        </div>
      )}
      <div className="card">
        <h3>Membros</h3>
        {erro && <p className="erro">{erro}</p>}
        {casa.members.map((m) => (
          <div className="item membro" key={m.id}>
            <span>{m.name} <span className="detalhe">· {roleLabel(m.role)}</span></span>
            <div className="membro-acoes">
              {m.role === 'ADOLESCENTE' && <span className="detalhe">{m.xp} XP</span>}
              {ehAdmin && m.role === 'ADOLESCENTE' && (
                <button className="perigo pequeno" onClick={() => excluir(m)}>Excluir</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function textoAtividade(a: Atividade): string {
  if (a.kind === 'TAREFA_CONCLUIDA') {
    return `${a.actorName} marcou "${a.title}" como feita. Aguardando sua aprovação (${a.amount} XP).`;
  }
  if (a.kind === 'RECOMPENSA_RESGATADA') {
    return `${a.actorName} resgatou "${a.title}" (${a.amount} XP).`;
  }
  return `Nova tarefa para você: "${a.title}" (${a.amount} XP).`;
}

function quando(dataSql: string): string {
  // O SQLite grava em UTC no formato "AAAA-MM-DD HH:MM:SS".
  return new Date(dataSql.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function AtualizacoesTab({ onLidas }: { onLidas: () => void }) {
  const [itens, setItens] = useState<Atividade[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<{ activities: Atividade[] }>('GET', '/activities')
      .then(async (r) => {
        // Mostra as novidades (ainda marcadas como não lidas) e só depois marca como lidas.
        setItens(r.activities);
        await api('POST', '/activities/read');
        onLidas();
      })
      .catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <h2>Notificações</h2>
      {erro && <p className="erro">{erro}</p>}
      {itens.length === 0 && <p className="vazio">Nenhuma atualização ainda.</p>}
      {itens.map((a) => (
        <div className={`card atualizacao ${a.read ? '' : 'nova'}`} key={a.id}>
          <p>{textoAtividade(a)}</p>
          {a.description && <p className="orientacao">{a.description}</p>}
          <small>{quando(a.createdAt)}</small>
        </div>
      ))}
    </section>
  );
}
