import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS,
  type IpcEventChannel,
  type IpcInvokeChannel,
  type IpcSendChannel,
} from '../shared/ipcTypes';

const invokeChannels = new Set<string>(IPC_INVOKE_CHANNELS);
const eventChannels = new Set<string>(IPC_EVENT_CHANNELS);
const sendChannels = new Set<string>(IPC_SEND_CHANNELS);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: IpcInvokeChannel, ...args: unknown[]) => {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Unsupported IPC invoke channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: IpcEventChannel, callback: (...args: unknown[]) => void) => {
    if (!eventChannels.has(channel)) {
      throw new Error(`Unsupported IPC event channel: ${channel}`);
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  send: (channel: IpcSendChannel) => {
    if (!sendChannels.has(channel)) {
      throw new Error(`Unsupported IPC send channel: ${channel}`);
    }
    ipcRenderer.send(channel);
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
