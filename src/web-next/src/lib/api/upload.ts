import { ApiError, getJson, postJson } from './client';
import type {
  HostInfo,
  IngestEvent,
  IngestProgressEvent,
  IngestResult,
  ListDirResponse,
  UploadResult,
} from './types';

export function adminHostInfo(): Promise<HostInfo> {
  return getJson<HostInfo>('/api/admin/host-info');
}

export function adminPickPath(kind: 'file' | 'directory'): Promise<{ path: string | null }> {
  return postJson<{ path: string | null }, { kind: 'file' | 'directory' }>('/api/admin/pick-path', { kind });
}

export function adminListDir(path: string): Promise<ListDirResponse> {
  return getJson<ListDirResponse>('/api/admin/list-dir', { path });
}

export async function adminAddPath(
  targetPath: string,
  onProgress?: (event: IngestProgressEvent) => void,
): Promise<IngestResult> {
  const res = await fetch('/api/admin/add-path', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => undefined);
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const errors: string[] = [];
  let buffer = '';
  let added = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let event: IngestEvent;
      try {
        event = JSON.parse(line) as IngestEvent;
      } catch {
        continue;
      }
      if (event.type === 'progress') onProgress?.(event);
      else if (event.type === 'error') errors.push(event.message);
      else if (event.type === 'done') added = event.added;
    }
  }

  return { added, errors };
}

export function adminUploadFile(
  file: File,
  relPath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload');
    xhr.responseType = 'json';
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-CB8-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-CB8-Relpath', encodeURIComponent(relPath || file.name));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((xhr.response || {}) as UploadResult);
        return;
      }
      reject(new Error(xhr.response?.error || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(file);
  });
}
