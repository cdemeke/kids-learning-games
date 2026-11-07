const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const root = path.resolve(__dirname, '..');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200, height: 850,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    const home = () => win.loadFile(path.join(root, 'index.html'));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        try {
            const target = fileURLToPath(url);
            if (path.dirname(target) !== root || path.extname(target) !== '.html') event.preventDefault();
        } catch { event.preventDefault(); }
    });
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
            event.preventDefault();
            home();
        }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' },
        { label: 'Games', submenu: [
            { label: 'Choose a Game', accelerator: 'CmdOrCtrl+Home', click: home },
            { role: 'togglefullscreen' }
        ] },
        { role: 'editMenu' },
        { role: 'windowMenu' }
    ]));
    home();
}
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
