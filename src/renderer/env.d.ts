/// <reference types="vite/client" />

import type {
  IpcEventArgs,
  IpcEventChannel,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResult,
  IpcSendChannel,
} from '../shared/ipcTypes';

interface ElectronAPI {
  invoke: <C extends IpcInvokeChannel>(
    channel: C,
    ...args: IpcInvokeArgs<C>
  ) => Promise<IpcInvokeResult<C>>;
  on: <C extends IpcEventChannel>(
    channel: C,
    callback: (...args: IpcEventArgs<C>) => void
  ) => () => void;
  send: (channel: IpcSendChannel) => void;
  getPathForFile: (file: File) => string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
