import type { QueryOptions, QueryResult, ScanProgress, MediaRecord } from './types';

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
  | { buffer: ArrayBuffer; mime: string }
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

// ---------------------------------------------------------------------------
// Channel registries
//
// Each registry is a plain object mapping channel names to a phantom payload
// type. We don't read the values at runtime — they're carried only in TS — so
// the underlying object can be `as const` and stripped to keys for the
// preload allowlist. Adding a channel = one edit here.
// ---------------------------------------------------------------------------

type Spec<Args extends readonly unknown[], Result> = { args: Args; result: Result };

// `phantom` exists only so the const-object trick has values; readers never
// touch it. Using `null!` keeps the bundle small.
const phantom = null! as never;

export const IpcInvokeMap = {
  'archive:open':                  phantom as Spec<[filePath: string], ArchiveOpenResponse>,
  'archive:page':                  phantom as Spec<[pageIndex: number], ArchivePageResponse>,
  'archive:close':                 phantom as Spec<[], void>,
  'book:read-file':                phantom as Spec<[filePath: string], ArrayBuffer>,
  'dialog:open-file':              phantom as Spec<[], string | null>,
  'dialog:open-directory':         phantom as Spec<[], string | null>,
  'library:query':                 phantom as Spec<[options: QueryOptions], QueryResult>,
  'library:scan':                  phantom as Spec<[directoryPath: string], number>,
  'library:scan-books':            phantom as Spec<[directoryPath: string], number>,
  'library:classify-paths':        phantom as Spec<[paths: string[]], { files: string[]; directories: string[] }>,
  'library:add-files':             phantom as Spec<[filePaths: string[]], AddFilesResponse>,
  'library:refresh-book-metadata': phantom as Spec<[comicId: number], MediaRecord | null>,
  'library:add-tag':               phantom as Spec<[comicId: number, tag: string], void>,
  'library:remove-tag':            phantom as Spec<[comicId: number, tag: string], void>,
  'library:remove-comics':         phantom as Spec<[ids: number[]], void>,
  'library:get-thumbnail':         phantom as Spec<[comicId: number], Buffer | null>,
  'library:get-tags':              phantom as Spec<[], string[]>,
  'library:rename-tag':            phantom as Spec<[oldName: string, newName: string], void>,
  'library:delete-tag':            phantom as Spec<[tag: string], void>,
  'library:add-tag-bulk':          phantom as Spec<[comicIds: number[], tag: string], void>,
  'library:remove-tag-bulk':       phantom as Spec<[comicIds: number[], tag: string], void>,
  'libraries:list':                phantom as Spec<[mediaType?: 'comic' | 'book'], LibrarySummary[]>,
  'libraries:create':              phantom as Spec<[name: string, mediaType?: 'comic' | 'book'], { id: number; name: string; mediaType: 'comic' | 'book' } | null>,
  'libraries:rename':              phantom as Spec<[id: number, newName: string], void>,
  'libraries:delete':              phantom as Spec<[id: number], void>,
  'libraries:add-comics':          phantom as Spec<[libraryId: number, comicIds: number[]], void>,
  'libraries:add-folders':         phantom as Spec<[libraryId: number, folderIds: number[]], void>,
  'libraries:remove-comics':       phantom as Spec<[libraryId: number, comicIds: number[]], void>,
  'libraries:query':               phantom as Spec<[libraryId: number, options: QueryOptions], QueryResult>,
  'folders:list':                  phantom as Spec<[libraryId?: number | null], FolderSummary[]>,
  'folders:create':                phantom as Spec<[name: string, comicIds: number[]], { id: number; name: string } | null>,
  'folders:rename':                phantom as Spec<[id: number, newName: string], void>,
  'folders:delete':                phantom as Spec<[id: number], void>,
  'folders:add-comics':            phantom as Spec<[folderId: number, comicIds: number[]], void>,
  'folders:remove-comics':         phantom as Spec<[folderId: number, comicIds: number[]], void>,
  'folders:query':                 phantom as Spec<[folderId: number, options: QueryOptions], QueryResult>,
  'reading:update-progress':       phantom as Spec<[comicId: number, pageIndex: number], void>,
  'reading:update-location':       phantom as Spec<[comicId: number, location: string], void>,
  'reading:recently-read':         phantom as Spec<[limit?: number, mediaType?: 'comic' | 'book'], MediaRecord[]>,
  'reading:get-comic-by-path':     phantom as Spec<[filePath: string], MediaRecord | null>,
  'shell:open-path':               phantom as Spec<[filePath: string], string>,
  'window:toggle-fullscreen':      phantom as Spec<[], void>,
  'window:exit-fullscreen':        phantom as Spec<[], void>,
  'webserver:get-settings':        phantom as Spec<[], { enabled: boolean; port: number; url: string | null; lanUrl: string | null }>,
  'webserver:set-settings':        phantom as Spec<[enabled: boolean, port: number], { enabled: boolean; port: number; url: string | null; lanUrl: string | null }>,
  'app-meta:get':                  phantom as Spec<[key: string], string | null>,
  'app-meta:set':                  phantom as Spec<[key: string, value: string], void>,
} as const;

export const IpcEventMap = {
  'library:scan-progress': phantom as [progress: ScanProgress],
  'file-opened':           phantom as [filePath: string],
  'open-settings':         phantom as [],
} as const;

export const IpcSendMap = {
  'library:scan-cancel': phantom as [],
} as const;

// ---------------------------------------------------------------------------
// Derived types + runtime allowlists. No hand-maintained arrays.
// ---------------------------------------------------------------------------

export type IpcInvokeChannel = keyof typeof IpcInvokeMap;
export type IpcEventChannel = keyof typeof IpcEventMap;
export type IpcSendChannel = keyof typeof IpcSendMap;

export type IpcInvokeArgs<C extends IpcInvokeChannel>   = (typeof IpcInvokeMap)[C]['args'];
export type IpcInvokeResult<C extends IpcInvokeChannel> = (typeof IpcInvokeMap)[C]['result'];
export type IpcEventArgs<C extends IpcEventChannel>     = (typeof IpcEventMap)[C];

export const IPC_INVOKE_CHANNELS = Object.keys(IpcInvokeMap) as IpcInvokeChannel[];
export const IPC_EVENT_CHANNELS  = Object.keys(IpcEventMap)  as IpcEventChannel[];
export const IPC_SEND_CHANNELS   = Object.keys(IpcSendMap)   as IpcSendChannel[];
