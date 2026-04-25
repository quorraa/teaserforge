import { app, BrowserWindow, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerExportIpc } from './ipc/export';
import { registerFilesystemIpc } from './ipc/filesystem';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'teaserforge',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1720,
    height: 980,
    minWidth: 1180,
    minHeight: 740,
    title: 'TeaserForge',
    backgroundColor: '#070b12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle('teaserforge', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'media') {
      return new Response('Not found', { status: 404 });
    }
    const filePath = url.searchParams.get('path');
    if (!filePath || !path.isAbsolute(filePath)) {
      return new Response('Invalid media path', { status: 400 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  registerFilesystemIpc();
  registerExportIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
