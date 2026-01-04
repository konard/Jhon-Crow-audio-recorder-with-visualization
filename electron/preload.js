const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  saveVideoAndShow: async (blob, fileName) => {
    // Convert Blob to ArrayBuffer for IPC transfer
    // Use Uint8Array directly instead of converting to Array to avoid
    // "Invalid array length" error with large files (200MB+)
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    return ipcRenderer.invoke('save-video-and-show', uint8Array, fileName);
  },
  isElectron: true,
});
