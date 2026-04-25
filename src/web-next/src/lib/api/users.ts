import { deleteJson, getJson, postJson, putJson } from './client';
import type { ApiOk, UserSummary } from './types';

export function getUsers(): Promise<UserSummary[]> {
  return getJson<UserSummary[]>('/api/users');
}

export function createUser(username: string, password: string, isAdmin = false): Promise<UserSummary> {
  return postJson<UserSummary, { username: string; password: string; isAdmin: boolean }>('/api/users', {
    username,
    password,
    isAdmin,
  });
}

export function deleteUser(id: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/users/${id}`);
}

export function setUserRole(id: number, isAdmin: boolean): Promise<ApiOk> {
  return putJson<ApiOk, { isAdmin: boolean }>(`/api/users/${id}/role`, { isAdmin });
}
