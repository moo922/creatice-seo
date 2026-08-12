import type { LoginResponseDto } from '@creative-seo/types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

/**
 * Session access-token holder. The AuthProvider owns the user state; this
 * module only remembers the current bearer token so the fetch layer can attach
 * it without a circular dependency.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper. Unwraps the API's { data } envelope (passing through
 * paginated { data, meta } untouched), and transparently refreshes the access
 * token once when a request comes back 401.
 */
async function request<T>(path: string, init: RequestInit = {}, skipAuth = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (skipAuth !== true && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (response.status === 401 && skipAuth !== true) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, init, skipAuth);
    }
    onUnauthorized?.();
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `Request failed with ${response.status}`) ?? `Request failed with ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  if (
    body &&
    typeof body === 'object' &&
    'data' in body &&
    !('meta' in body) &&
    !('error' in body)
  ) {
    // Unwrap the { data } envelope. Paginated { data, meta } responses and
    // error envelopes pass through untouched.
    return (body as { data: T }).data;
  }
  return body as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as LoginResponseDto;
    setAccessToken(body.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
