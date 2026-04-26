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

/*
 * PLAN10 Phase 4 audit. Channels are grouped by their fate post-renderer-removal:
 *
 *   HOST       — Stay. Genuine shell concerns (native pickers, OS open, fullscreen,
 *                embedded-server controls) with no HTTP-API equivalent.
 *   RETIRE     — Delete with `src/renderer/` in Phase 6. Each one duplicates an
 *                existing HTTP route the SPA already uses; the React renderer is
 *                the only remaining caller.
 *   AUDIT-GAP  — Retire-eligible but lacks a verified HTTP equivalent. Phase 5
 *                must port these onto the server before deletion.
 */
export const IpcInvokeMap = {
  // RETIRE — HTTP: /api/comics/:id/pages/:n streams pages directly.
  'archive:open':                  phantom as Spec<[filePath: string], ArchiveOpenResponse>,
  'archive:page':                  phantom as Spec<[pageIndex: number], ArchivePageResponse>,
  'archive:close':                 phantom as Spec<[], void>,
  // RETIRE — HTTP: /api/comics/:id/file streams the original file body.
  'book:read-file':                phantom as Spec<[filePath: string], ArrayBuffer>,
  // HOST — native pickers; the SPA falls back to <input type=file> in browsers.
  'dialog:open-file':              phantom as Spec<[], string | null>,
  'dialog:open-directory':         phantom as Spec<[], string | null>,
  // RETIRE — HTTP: GET /api/comics covers the same query shape.
  'library:query':                 phantom as Spec<[options: QueryOptions], QueryResult>,
  // RETIRE — HTTP: /api/admin/add-path runs an equivalent server-side scan.
  'library:scan':                  phantom as Spec<[directoryPath: string], number>,
  'library:scan-books':            phantom as Spec<[directoryPath: string], number>,
  // RETIRE — local-fs drop classification; SPA reads File objects directly and
  // posts to /api/admin/upload, which sidesteps the path classification step.
  'library:classify-paths':        phantom as Spec<[paths: string[]], { files: string[]; directories: string[] }>,
  'library:add-files':             phantom as Spec<[filePaths: string[]], AddFilesResponse>,
  // RETIRE — HTTP: POST /api/comics/:id/refresh-metadata.
  'library:refresh-book-metadata': phantom as Spec<[comicId: number], MediaRecord | null>,
  // RETIRE — HTTP: PUT /api/comics/:id/tags carries the full tag set.
  'library:add-tag':               phantom as Spec<[comicId: number, tag: string], void>,
  'library:remove-tag':            phantom as Spec<[comicId: number, tag: string], void>,
  // RETIRE — HTTP: DELETE /api/comics/:id (one-by-one); the SPA loops.
  'library:remove-comics':         phantom as Spec<[ids: number[]], void>,
  // RETIRE — HTTP: /api/comics/:id/thumbnail returns image bytes directly.
  'library:get-thumbnail':         phantom as Spec<[comicId: number], Buffer | null>,
  // RETIRE — HTTP: /api/tags + PUT /api/tags/:name + DELETE /api/tags/:name.
  'library:get-tags':              phantom as Spec<[], string[]>,
  'library:rename-tag':            phantom as Spec<[oldName: string, newName: string], void>,
  'library:delete-tag':            phantom as Spec<[tag: string], void>,
  // RETIRE — HTTP: POST/DELETE /api/tags/:name/comics with `{ comicIds }`.
  'library:add-tag-bulk':          phantom as Spec<[comicIds: number[], tag: string], void>,
  'library:remove-tag-bulk':       phantom as Spec<[comicIds: number[], tag: string], void>,
  // RETIRE — HTTP: /api/libraries[ /:id[ /comics ] ] mirrors all of these.
  'libraries:list':                phantom as Spec<[mediaType?: 'comic' | 'book'], LibrarySummary[]>,
  'libraries:create':              phantom as Spec<[name: string, mediaType?: 'comic' | 'book'], { id: number; name: string; mediaType: 'comic' | 'book' } | null>,
  'libraries:rename':              phantom as Spec<[id: number, newName: string], void>,
  'libraries:delete':              phantom as Spec<[id: number], void>,
  'libraries:add-comics':          phantom as Spec<[libraryId: number, comicIds: number[]], void>,
  // RETIRE — HTTP: POST /api/libraries/:id/folders with `{ folderIds }`.
  'libraries:add-folders':         phantom as Spec<[libraryId: number, folderIds: number[]], void>,
  'libraries:remove-comics':       phantom as Spec<[libraryId: number, comicIds: number[]], void>,
  'libraries:query':               phantom as Spec<[libraryId: number, options: QueryOptions], QueryResult>,
  // RETIRE — HTTP: /api/folders[ /:id[ /comics ] ].
  'folders:list':                  phantom as Spec<[libraryId?: number | null], FolderSummary[]>,
  'folders:create':                phantom as Spec<[name: string, comicIds: number[]], { id: number; name: string } | null>,
  'folders:rename':                phantom as Spec<[id: number, newName: string], void>,
  'folders:delete':                phantom as Spec<[id: number], void>,
  'folders:add-comics':            phantom as Spec<[folderId: number, comicIds: number[]], void>,
  'folders:remove-comics':         phantom as Spec<[folderId: number, comicIds: number[]], void>,
  'folders:query':                 phantom as Spec<[folderId: number, options: QueryOptions], QueryResult>,
  // RETIRE — HTTP: PUT /api/comics/:id/progress + /api/recently-read.
  'reading:update-progress':       phantom as Spec<[comicId: number, pageIndex: number], void>,
  'reading:update-location':       phantom as Spec<[comicId: number, location: string], void>,
  'reading:recently-read':         phantom as Spec<[limit?: number, mediaType?: 'comic' | 'book'], MediaRecord[]>,
  // HOST — used by main when resolving `file-opened` to a comic id; never
  // called from the SPA. Keep for the OS-open code path.
  'reading:get-comic-by-path':     phantom as Spec<[filePath: string], MediaRecord | null>,
  // HOST — open a path in the OS file manager / default app.
  'shell:open-path':               phantom as Spec<[filePath: string], string>,
  // HOST — browsers have a native Fullscreen API; this drives Electron's
  // BrowserWindow chrome instead.
  'window:toggle-fullscreen':      phantom as Spec<[], void>,
  'window:exit-fullscreen':        phantom as Spec<[], void>,
  // HOST — controls the embedded server itself; no HTTP analogue makes sense.
  'webserver:get-settings':        phantom as Spec<[], { enabled: boolean; port: number; url: string | null; lanUrl: string | null }>,
  'webserver:set-settings':        phantom as Spec<[enabled: boolean, port: number], { enabled: boolean; port: number; url: string | null; lanUrl: string | null }>,
  // RETIRE — only used by the React renderer's LibraryView for its
  // `filterPreset` UI state. The SPA equivalent already persists prefs
  // via localStorage (see views/reader/prefs.js); no server route needed.
  'app-meta:get':                  phantom as Spec<[key: string], string | null>,
  'app-meta:set':                  phantom as Spec<[key: string, value: string], void>,
} as const;

export const IpcEventMap = {
  'library:scan-progress': phantom as [progress: ScanProgress],
  'file-opened':           phantom as [filePath: string],
  'comic-opened':          phantom as [comicId: number],
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
