import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { ApiError, request, type Me, type Reward, type Task } from '../api';
import { colors, styles } from '../styles';

interface Props {
  token: string;
  me: Me;
  onLogout: () => void;
  onMeChange: () => void;
}

/** Visão do adolescente: vê as próprias tarefas, conclui e resgata recompensas. */
export default function AdolescenteScreen({ token, me, onLogout, onMeChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([
      request<{ tasks: Task[] }>('GET', '/tasks', undefined, token),
      request<{ rewards: Reward[] }>('GET', '/rewards', undefined, token),
    ]);
    setTasks(t.tasks);
    setRewards(r.rewards);
  }, [token]);

  useEffect(() => {
    load().catch(showError);
  }, [load]);

  function showError(err: unknown) {
    Alert.alert('Ops', err instanceof ApiError ? err.message : 'Erro de conexão');
  }

  async function complete(id: number) {
    try {
      await request('POST', `/tasks/${id}/complete`, undefined, token);
      await load();
    } catch (err) {
      showError(err);
    }
  }

  async function redeem(reward: Reward) {
    try {
      await request('POST', `/rewards/${reward.id}/redeem`, undefined, token);
      await load();
      onMeChange();
      Alert.alert('Parabéns!', `Você resgatou: ${reward.title}`);
    } catch (err) {
      showError(err);
    }
  }

  const abertas = tasks.filter((t) => t.status !== 'APROVADA');
  const feitas = tasks.filter((t) => t.status === 'APROVADA');

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Olá, {me.name}</Text>
      <Text style={styles.subtitle}>Seu saldo: {me.xp} XP</Text>

      <Text style={[styles.cardTitle, { marginBottom: 8 }]}>Minhas tarefas</Text>
      {abertas.length === 0 && <Text style={styles.cardMeta}>Nenhuma tarefa pendente.</Text>}
      {abertas.map((t) => (
        <View key={t.id} style={styles.card}>
          <Text style={styles.cardTitle}>{t.title}</Text>
          <Text style={styles.cardMeta}>{t.xp} XP</Text>
          {t.status === 'PENDENTE' ? (
            <Pressable style={[styles.button, { marginTop: 12, marginBottom: 0 }]} onPress={() => complete(t.id)}>
              <Text style={styles.buttonText}>Marcar como feita</Text>
            </Pressable>
          ) : (
            <View style={[styles.pill, { backgroundColor: colors.warning }]}>
              <Text style={styles.pillText}>Aguardando aprovação</Text>
            </View>
          )}
        </View>
      ))}

      <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 8 }]}>Recompensas</Text>
      {rewards.map((r) => {
        const enough = me.xp >= r.cost;
        return (
          <View key={r.id} style={styles.card}>
            <Text style={styles.cardTitle}>{r.title}</Text>
            <Text style={styles.cardMeta}>{r.cost} XP</Text>
            <Pressable
              style={[styles.button, { marginTop: 12, marginBottom: 0, backgroundColor: enough ? colors.primary : '#9CA3AF' }]}
              onPress={() => enough && redeem(r)}
            >
              <Text style={styles.buttonText}>{enough ? 'Resgatar' : `Faltam ${r.cost - me.xp} XP`}</Text>
            </Pressable>
          </View>
        );
      })}

      {feitas.length > 0 && (
        <>
          <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 8 }]}>Já aprovadas</Text>
          {feitas.map((t) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.cardMeta}>+{t.xp} XP</Text>
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
