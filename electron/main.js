const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'icon.png'),
    title: 'Audio Recorder with Visualization',
    backgroundColor: '#1a1a2e',
  });

  // Load the examples/index.html file
  mainWindow.loadFile(path.join(__dirname, '..', 'examples', 'index.html'));

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle permission requests for media (microphone)
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Allow microphone access for audio recording
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
});

// IPC handler for saving file and showing in folder
ipcMain.handle('save-video-and-show', async (event, blob, fileName) => {
  try {
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [
        { name: 'Video Files', extensions: ['webm', 'mp4'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Write the blob to the selected file
    const buffer = Buffer.from(blob);
    fs.writeFileSync(result.filePath, buffer);

    // Show the file in folder
    shell.showItemInFolder(result.filePath);

    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
});
