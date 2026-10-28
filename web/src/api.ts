// Comunicação com o backend. O token fica salvo no navegador do celular/PC.
const TOKEN_KEY = 'casaxp_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (import.meta.env.VITE_DEMO === 'true') {
    // Versão de demonstração: sem servidor, tudo fica neste navegador.
    const { demoRequest } = await import('./demo/demoApi');
    const r = await demoRequest(method, path, body, token);
    if (r.status >= 400) throw new ApiError(r.data.error ?? 'Algo deu errado', r.status);
    return r.data as T;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Algo deu errado', res.status);
  return data as T;
}
