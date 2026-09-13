const API_BASE = (import.meta.env.VITE_API_BASE as string) ?? '';

const TOKEN_KEY = 'mountpath_admin_token';
const USER_KEY = 'mountpath_admin_user';

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string;
  role: string;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AdminUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isStaff(role?: string) {
  return role === 'ops' || role === 'admin';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** 注册 401 回调（AuthProvider 里清会话并跳登录） */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const h = new Headers(headers);
  if (!h.has('Content-Type') && rest.body) {
    h.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getToken();
    if (token) h.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers: h });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
      onUnauthorized?.();
    }
    throw new ApiError(res.status, (json as { error?: string }).error || res.statusText);
  }
  return ((json as { data?: T }).data !== undefined ? (json as { data: T }).data : json) as T;
}

export async function login(phone: string, code: string) {
  const data = await api<{ token: string; user: AdminUser }>('/api/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ phone, code }),
  });
  if (!isStaff(data.user.role)) {
    throw new ApiError(403, '该账号无运营权限，请使用管理员账号登录');
  }
  setSession(data.token, data.user);
  return data;
}

export async function fetchAdminMe() {
  return api<AdminUser>('/api/v1/admin/me');
}
