import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ApiError, request, type Me, type Reward, type Task } from '../api';
import { colors, styles } from '../styles';

interface Props {
  token: string;
  me: Me;
  onLogout: () => void;
}

type Tab = 'tarefas' | 'recompensas';

const STATUS_LABEL: Record<Task['status'], { text: string; color: string }> = {
  PENDENTE: { text: 'Pendente', color: colors.muted },
  AGUARDANDO_APROVACAO: { text: 'Aguardando aprovação', color: colors.warning },
  APROVADA: { text: 'Aprovada', color: colors.success },
};

/** Visão do responsável: cria tarefas e recompensas, aprova ou recusa. */
export default function ResponsavelScreen({ token, me, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('tarefas');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [members, setMembers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [inviteCode, setInviteCode] = useState('');

  const [title, setTitle] = useState('');
  const [xp, setXp] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [rTitle, setRTitle] = useState('');
  const [rCost, setRCost] = useState('');

  const load = useCallback(async () => {
    const [t, r, h] = await Promise.all([
      request<{ tasks: Task[] }>('GET', '/tasks', undefined, token),
      request<{ rewards: Reward[] }>('GET', '/rewards', undefined, token),
      request<{ household: { inviteCode: string }; members: any[] }>('GET', '/household', undefined, token),
    ]);
    setTasks(t.tasks);
    setRewards(r.rewards);
    setInviteCode(h.household.inviteCode);
    const kids = h.members.filter((m) => m.role === 'ADOLESCENTE');
    setMembers(kids);
    if (kids.length && assigneeId === null) setAssigneeId(kids[0].id);
  }, [token, assigneeId]);

  useEffect(() => {
    load().catch(showError);
  }, [load]);

  function showError(err: unknown) {
    Alert.alert('Ops', err instanceof ApiError ? err.message : 'Erro de conexão');
  }

  async function createTask() {
    try {
      await request('POST', '/tasks', { title, xp: Number(xp), assigneeId }, token);
      setTitle('');
      setXp('');
      await load();
    } catch (err) {
      showError(err);
    }
  }

  async function reviewTask(id: number, action: 'approve' | 'reject') {
    try {
      await request('POST', `/tasks/${id}/${action}`, undefined, token);
      await load();
    } catch (err) {
      showError(err);
    }
  }

  async function createReward() {
    try {
      await request('POST', '/rewards', { title: rTitle, cost: Number(rCost) }, token);
      setRTitle('');
      setRCost('');
      await load();
    } catch (err) {
      showError(err);
    }
  }

  const pendentes = tasks.filter((t) => t.status === 'AGUARDANDO_APROVACAO');

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Olá, {me.name}</Text>
      <Text style={styles.subtitle}>Código da casa: {inviteCode}</Text>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'tarefas' && styles.tabActive]} onPress={() => setTab('tarefas')}>
          <Text style={[styles.tabText, tab === 'tarefas' && styles.tabTextActive]}>Tarefas</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'recompensas' && styles.tabActive]} onPress={() => setTab('recompensas')}>
          <Text style={[styles.tabText, tab === 'recompensas' && styles.tabTextActive]}>Recompensas</Text>
        </Pressable>
      </View>

      {tab === 'tarefas' && (
        <>
          {pendentes.length > 0 && (
            <Text style={[styles.cardTitle, { marginBottom: 8 }]}>Para aprovar ({pendentes.length})</Text>
          )}
          {pendentes.map((t) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.cardMeta}>{t.assigneeName} · {t.xp} XP</Text>
              <View style={styles.row}>
                <Pressable style={[styles.button, { flex: 1, marginBottom: 0 }]} onPress={() => reviewTask(t.id, 'approve')}>
                  <Text style={styles.buttonText}>Aprovar</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.buttonSecondary, { flex: 1, marginBottom: 0 }]} onPress={() => reviewTask(t.id, 'reject')}>
                  <Text style={styles.buttonTextSecondary}>Recusar</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 8 }]}>Nova tarefa</Text>
          <TextInput style={styles.input} placeholder="Título (ex.: Lavar a louça)" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="XP (ex.: 20)" keyboardType="number-pad" value={xp} onChangeText={setXp} />
          <Text style={styles.cardMeta}>Atribuir a:</Text>
          <View style={[styles.row, { marginBottom: 12 }]}>
            {members.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.tab, assigneeId === m.id && styles.tabActive]}
                onPress={() => setAssigneeId(m.id)}
              >
                <Text style={[styles.tabText, assigneeId === m.id && styles.tabTextActive]}>{m.name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.button} onPress={createTask} disabled={!members.length}>
            <Text style={styles.buttonText}>{members.length ? 'Criar tarefa' : 'Convide um adolescente primeiro'}</Text>
          </Pressable>

          <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 8 }]}>Todas as tarefas</Text>
          {tasks.map((t) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.cardMeta}>{t.assigneeName} · {t.xp} XP</Text>
              <View style={[styles.pill, { backgroundColor: STATUS_LABEL[t.status].color }]}>
                <Text style={styles.pillText}>{STATUS_LABEL[t.status].text}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {tab === 'recompensas' && (
        <>
          <Text style={[styles.cardTitle, { marginBottom: 8 }]}>Nova recompensa</Text>
          <TextInput style={styles.input} placeholder="Nome (ex.: Sorvete)" value={rTitle} onChangeText={setRTitle} />
          <TextInput style={styles.input} placeholder="Custo em XP (ex.: 50)" keyboardType="number-pad" value={rCost} onChangeText={setRCost} />
          <Pressable style={styles.button} onPress={createReward}>
            <Text style={styles.buttonText}>Criar recompensa</Text>
          </Pressable>

          <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 8 }]}>Recompensas da casa</Text>
          {rewards.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.cardTitle}>{r.title}</Text>
              <Text style={styles.cardMeta}>{r.cost} XP</Text>
            </View>
          ))}
        </>
      )}

      <Pressable style={[styles.button, styles.buttonSecondary, { marginTop: 24 }]} onPress={onLogout}>
        <Text style={styles.buttonTextSecondary}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}
