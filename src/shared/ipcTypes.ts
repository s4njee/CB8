import type { ComicDetail } from './types';

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
 * Post-PLAN10 Phase 6, the IPC surface is host-only. Every product
 * operation (libraries, folders, comics, tags, progress, scans, archive
 * paging, file ingest) goes through the embedded HTTP API the SPA
 * already consumes. What's left here is what the browser genuinely
 * cannot do: native pickers, OS-driven open, fullscreen, embedded-server
 * configuration, and a single helper main uses to translate an OS file
 * path to a library comic id.
 */
export const IpcInvokeMap = {
  'dialog:open-file':              phantom as Spec<[], string | null>,
  'dialog:open-directory':         phantom as Spec<[], string | null>,
  'reading:get-comic-by-path':     phantom as Spec<[filePath: string], ComicDetail | null>,
  'shell:open-path':               phantom as Spec<[filePath: string], string>,
  'window:toggle-fullscreen':      phantom as Spec<[], void>,
  'window:exit-fullscreen':        phantom as Spec<[], void>,
  'webserver:get-settings':        phantom as Spec<[], { enabled: boolean; port: number; url: string | null; lanUrl: string | null }>,
  'webserver:set-settings':        phantom as Spec<[enabled: boolean, port: number], { enabled: boolean; port: number; url: string | null; lanUrl: string | null }>,
} as const;

export const IpcEventMap = {
  'comic-opened':          phantom as [comicId: number],
  'open-settings':         phantom as [],
} as const;

export const IpcSendMap = {
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
