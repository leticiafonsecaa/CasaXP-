import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ApiError, request, type Role } from '../api';
import { colors, styles } from '../styles';

interface Props {
  onAuthenticated: (token: string) => void;
}

/** Tela única de entrar/criar conta. Papel e campos extras mudam conforme a escolha. */
export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [role, setRole] = useState<Role>('RESPONSAVEL');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await request<{ token: string }>('POST', '/auth/login', { email, password });
        onAuthenticated(data.token);
      } else {
        const data = await request<{ token: string; inviteCode?: string }>('POST', '/auth/signup', {
          name,
          email,
          password,
          role,
          householdName: role === 'RESPONSAVEL' ? householdName : undefined,
          inviteCode: role === 'ADOLESCENTE' ? inviteCode : undefined,
        });
        onAuthenticated(data.token);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>CasaXP</Text>
      <Text style={styles.subtitle}>Tarefas da casa viram XP. XP vira recompensa.</Text>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}>
          <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Entrar</Text>
        </Pressable>
        <Pressable style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => setMode('signup')}>
          <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Criar conta</Text>
        </Pressable>
      </View>

      {mode === 'signup' && (
        <>
          <TextInput style={styles.input} placeholder="Seu nome" value={name} onChangeText={setName} />
          <View style={styles.row}>
            <Pressable
              style={[styles.button, styles.buttonSecondary, { flex: 1 }, role === 'RESPONSAVEL' && { backgroundColor: colors.primary }]}
              onPress={() => setRole('RESPONSAVEL')}
            >
              <Text style={[styles.buttonText, role !== 'RESPONSAVEL' && styles.buttonTextSecondary]}>Responsável</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonSecondary, { flex: 1 }, role === 'ADOLESCENTE' && { backgroundColor: colors.primary }]}
              onPress={() => setRole('ADOLESCENTE')}
            >
              <Text style={[styles.buttonText, role !== 'ADOLESCENTE' && styles.buttonTextSecondary]}>Adolescente</Text>
            </Pressable>
          </View>
          {role === 'RESPONSAVEL' ? (
            <TextInput style={styles.input} placeholder="Nome da casa (ex.: Casa Silva)" value={householdName} onChangeText={setHouseholdName} />
          ) : (
            <TextInput style={styles.input} placeholder="Código de convite da casa" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} />
          )}
        </>
      )}

      <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={submit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</Text>
      </Pressable>
    </ScrollView>
  );
}
