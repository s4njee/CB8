import { writable } from 'svelte/store';

export type ToastKind = 'info' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const items = writable<ToastItem[]>([]);
let nextId = 1;

function push(message: string, kind: ToastKind): number {
  const id = nextId++;
  items.update((current) => [...current, { id, message, kind }]);
  setTimeout(() => {
    items.update((current) => current.filter((toast) => toast.id !== id));
  }, 3000);
  return id;
}

export const toasts = {
  subscribe: items.subscribe,
};

export function showToast(message: string): number {
  return push(message, 'info');
}

export function showErrorToast(message: string): number {
  return push(message, 'error');
}
