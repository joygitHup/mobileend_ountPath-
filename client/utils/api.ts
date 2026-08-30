import { clearStoredAuth, getStoredToken } from '@/utils/authStorage';

const BASE_URL = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/$/, '');

type AuthInvalidHandler = () => void;
let authInvalidHandler: AuthInvalidHandler | null = null;

/** AuthProvider 注册：收到 401 时清本地会话并回到登录闸门 */
export function setAuthInvalidHandler(handler: AuthInvalidHandler | null) {
  authInvalidHandler = handler;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) {
    throw new Error(
      '未配置 EXPO_PUBLIC_BACKEND_BASE_URL（主后端默认 http://127.0.0.1:9092）'
    );
  }
  const token = await getStoredToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      await clearStoredAuth();
      authInvalidHandler?.();
    }
    const msg =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error: string }).error)
        : `API error: ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}
