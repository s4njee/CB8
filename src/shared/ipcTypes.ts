import type { QueryOptions, QueryResult, ScanProgress } from './types';

export interface LibrarySummary {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book';
}

export type ArchiveOpenResponse =
  | { pageCount: number; filename: string }
  | { error: string };

export type ArchivePageResponse =
  | { dataUrl: string }
  | { error: string };

export interface AddFilesResponse {
  added: number;
  errors: string[];
}

export interface FolderSummary {
  id: number;
  name: string;
  comicCount: number;
  coverThumbnail: Buffer | null;
}

export interface IpcInvokeMap {
  'archive:open': { args: [filePath: string]; result: ArchiveOpenResponse };
  'archive:page': { args: [pageIndex: number]; result: ArchivePageResponse };
  'archive:close': { args: []; result: void };
  'book:read-file': { args: [filePath: string]; result: ArrayBuffer };
  'dialog:open-file': { args: []; result: string | null };
  'dialog:open-directory': { args: []; result: string | null };
  'library:query': { args: [options: QueryOptions]; result: QueryResult };
  'library:scan': { args: [directoryPath: string]; result: number };
  'library:scan-books': { args: [directoryPath: string]; result: number };
  'library:add-files': { args: [filePaths: string[]]; result: AddFilesResponse };
  'library:refresh-book-metadata': { args: [comicId: number]; result: import('./types').ComicRecord | null };
  'library:add-tag': { args: [comicId: number, tag: string]; result: void };
  'library:remove-tag': { args: [comicId: number, tag: string]; result: void };
  'library:remove-comics': { args: [ids: number[]]; result: void };
  'library:get-thumbnail': { args: [comicId: number]; result: Buffer | null };
  'library:get-tags': { args: []; result: string[] };
  'library:rename-tag': { args: [oldName: string, newName: string]; result: void };
  'library:delete-tag': { args: [tag: string]; result: void };
  'library:add-tag-bulk': { args: [comicIds: number[], tag: string]; result: void };
  'library:remove-tag-bulk': { args: [comicIds: number[], tag: string]; result: void };
  'libraries:list': { args: [mediaType?: 'comic' | 'book']; result: LibrarySummary[] };
  'libraries:create': { args: [name: string, mediaType?: 'comic' | 'book']; result: { id: number; name: string; mediaType: 'comic' | 'book' } | null };
  'libraries:rename': { args: [id: number, newName: string]; result: void };
  'libraries:delete': { args: [id: number]; result: void };
  'libraries:add-comics': { args: [libraryId: number, comicIds: number[]]; result: void };
  'libraries:add-folders': { args: [libraryId: number, folderIds: number[]]; result: void };
  'libraries:remove-comics': { args: [libraryId: number, comicIds: number[]]; result: void };
  'libraries:query': { args: [libraryId: number, options: QueryOptions]; result: QueryResult };
  'folders:list': { args: [libraryId?: number | null]; result: FolderSummary[] };
  'folders:create': { args: [name: string, comicIds: number[]]; result: { id: number; name: string } | null };
  'folders:rename': { args: [id: number, newName: string]; result: void };
  'folders:delete': { args: [id: number]; result: void };
  'folders:add-comics': { args: [folderId: number, comicIds: number[]]; result: void };
  'folders:remove-comics': { args: [folderId: number, comicIds: number[]]; result: void };
  'folders:query': { args: [folderId: number, options: QueryOptions]; result: QueryResult };
  'reading:update-progress': { args: [comicId: number, pageIndex: number]; result: void };
  'reading:update-location': { args: [comicId: number, location: string]; result: void };
  'reading:recently-read': { args: [limit?: number, mediaType?: 'comic' | 'book']; result: import('./types').ComicRecord[] };
  'reading:get-comic-by-path': { args: [filePath: string]; result: import('./types').ComicRecord | null };
  'shell:open-path': { args: [filePath: string]; result: string };
  'window:toggle-fullscreen': { args: []; result: void };
  'window:exit-fullscreen': { args: []; result: void };
  'webserver:get-settings': { args: []; result: { enabled: boolean; port: number; url: string | null; lanUrl: string | null } };
  'webserver:set-settings': { args: [enabled: boolean, port: number]; result: { enabled: boolean; port: number; url: string | null; lanUrl: string | null } };
}

export interface IpcEventMap {
  'library:scan-progress': [progress: ScanProgress];
  'file-opened': [filePath: string];
  'open-settings': [];
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcEventChannel = keyof IpcEventMap;

export type IpcInvokeArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C]['args'];
export type IpcInvokeResult<C extends IpcInvokeChannel> = IpcInvokeMap[C]['result'];
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventMap[C];

export const IPC_INVOKE_CHANNELS = [
  'archive:open',
  'archive:page',
  'archive:close',
  'book:read-file',
  'dialog:open-file',
  'dialog:open-directory',
  'library:query',
  'library:scan',
  'library:scan-books',
  'library:add-files',
  'library:refresh-book-metadata',
  'library:add-tag',
  'library:remove-tag',
  'library:remove-comics',
  'library:get-thumbnail',
  'library:get-tags',
  'library:rename-tag',
  'library:delete-tag',
  'library:add-tag-bulk',
  'library:remove-tag-bulk',
  'libraries:list',
  'libraries:create',
  'libraries:rename',
  'libraries:delete',
  'libraries:add-comics',
  'libraries:add-folders',
  'libraries:remove-comics',
  'libraries:query',
  'folders:list',
  'folders:create',
  'folders:rename',
  'folders:delete',
  'folders:add-comics',
  'folders:remove-comics',
  'folders:query',
  'reading:update-progress',
  'reading:update-location',
  'reading:recently-read',
  'reading:get-comic-by-path',
  'shell:open-path',
  'window:toggle-fullscreen',
  'window:exit-fullscreen',
  'webserver:get-settings',
  'webserver:set-settings',
] as const satisfies readonly IpcInvokeChannel[];

export const IPC_EVENT_CHANNELS = [
  'library:scan-progress',
  'file-opened',
  'open-settings',
] as const satisfies readonly IpcEventChannel[];
