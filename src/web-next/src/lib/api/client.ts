import type { QueryOptions } from './types';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type QueryPrimitive = string | number | boolean | null | undefined;
type QueryValue = QueryPrimitive | QueryPrimitive[];

function toSearchParams(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === '') continue;
        params.append(key, String(item));
      }
      continue;
    }
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json().catch(() => undefined);
  }
  return res.text().catch(() => undefined);
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  query?: Record<string, QueryValue>,
): Promise<T> {
  const res = await fetch(`${path}${toSearchParams(query)}`, {
    credentials: 'include',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const body = await parseBody(res);
  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

export function getJson<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
  return requestJson<T>(path, { method: 'GET' }, query);
}

export function postJson<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function putJson<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function deleteJson<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function buildQuery(options: QueryOptions = {}): Record<string, QueryValue> {
  return { ...options };
}
