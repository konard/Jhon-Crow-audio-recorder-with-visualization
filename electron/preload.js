const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  saveVideoAndShow: async (blob, fileName) => {
    // Convert Blob to ArrayBuffer for IPC transfer
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Array.from(new Uint8Array(arrayBuffer));
    return ipcRenderer.invoke('save-video-and-show', buffer, fileName);
  },
  isElectron: true,
});
