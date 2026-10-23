import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { loadToken, request, saveToken, type Me } from './src/api';
import { colors } from './src/styles';
import AuthScreen from './src/screens/AuthScreen';
import ResponsavelScreen from './src/screens/ResponsavelScreen';
import AdolescenteScreen from './src/screens/AdolescenteScreen';

/**
 * Fluxo: sem sessão -> tela de login/cadastro.
 * Com sessão -> tela conforme o papel (RESPONSAVEL ou ADOLESCENTE).
 * O token fica salvo no aparelho, então o usuário continua logado.
 */
export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const fetchMe = useCallback(async (t: string) => {
    try {
      const data = await request<{ user: Me }>('GET', '/auth/me', undefined, t);
      setMe(data.user);
      setToken(t);
    } catch {
      // Token inválido ou expirado: volta para o login.
      await saveToken(null);
      setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await loadToken();
      if (saved) await fetchMe(saved);
      setReady(true);
    })();
  }, [fetchMe]);

  async function handleAuthenticated(newToken: string) {
    await saveToken(newToken);
    await fetchMe(newToken);
  }

  async function logout() {
    await saveToken(null);
    setToken(null);
    setMe(null);
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {!token || !me ? (
        <AuthScreen onAuthenticated={handleAuthenticated} />
      ) : me.role === 'RESPONSAVEL' ? (
        <ResponsavelScreen key={token} token={token} me={me} onLogout={logout} />
      ) : (
        <AdolescenteScreen
          key={token}
          token={token}
          me={me}
          onLogout={logout}
          onMeChange={() => fetchMe(token)}
        />
      )}
    </>
  );
}
