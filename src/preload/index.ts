import { contextBridge } from 'electron';
import { electronAPI, ElectronAPI } from './api';

// Expose safe, typed electronAPI to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export { electronAPI, ElectronAPI };
