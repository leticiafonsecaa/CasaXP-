import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Endereço da API: defina EXPO_PUBLIC_API_URL no build ou use o padrão do app.json.
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string);

const TOKEN_KEY = 'casaxp.token';

export type Role = 'RESPONSAVEL' | 'ADOLESCENTE';

export interface Me {
  id: number;
  householdId: number;
  name: string;
  email: string;
  role: Role;
  xp: number;
}

export interface Task {
  id: number;
  title: string;
  xp: number;
  status: 'PENDENTE' | 'AGUARDANDO_APROVACAO' | 'APROVADA';
  assigneeId: number;
  assigneeName: string;
}

export interface Reward {
  id: number;
  title: string;
  cost: number;
}

export async function loadToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {}

export async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Erro inesperado');
  return data as T;
}
