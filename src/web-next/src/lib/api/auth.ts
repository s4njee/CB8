import { getJson, postJson, putJson } from './client';
import type { ApiOk, Session } from './types';

export interface LoginResponse extends ApiOk {
  user: Session['user'];
}

export function getSession(): Promise<Session> {
  return getJson<Session>('/api/auth/session');
}

export function getAdminSession(): Promise<Session> {
  return getJson<Session>('/api/admin/session');
}

export function login(identifier: string, password: string): Promise<LoginResponse> {
  return postJson<LoginResponse, { username: string; password: string }>('/api/auth/login', {
    username: identifier,
    password,
  });
}

export function adminLogin(password: string): Promise<LoginResponse> {
  return postJson<LoginResponse, { password: string }>('/api/admin/login', { password });
}

export function logout(): Promise<ApiOk> {
  return postJson<ApiOk>('/api/auth/logout');
}

export function adminLogout(): Promise<ApiOk> {
  return postJson<ApiOk>('/api/admin/logout');
}

export function setGuestAccess(enabled: boolean): Promise<ApiOk & { enabled: boolean }> {
  return putJson<ApiOk & { enabled: boolean }, { enabled: boolean }>('/api/settings/guest-access', { enabled });
}
