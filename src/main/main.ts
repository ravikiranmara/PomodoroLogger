import { nativeImage, Tray, BrowserWindow, Menu, ipcMain, MenuItem, app } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as db from './db';
import logo from '../res/icon_sm.png';
import fs from 'fs';
import { dbBaseDir, dbPaths } from '../config';
import { build } from '../../package.json';
import { AutoUpdater } from './AutoUpdater';

let win: BrowserWindow | undefined;

let useHardwareAcceleration = false;
try {
    const settings = fs.readFileSync(dbPaths.settingDB, { encoding: 'utf-8' });
    console.log({ settings });
    if (settings) {
        const json = JSON.parse(
            settings
                .split('\n')
                .filter((x) => !!x)
                .slice(-1)[0]
        );
        console.log(json);
        useHardwareAcceleration = json.useHardwareAcceleration;
    }
} catch (e) {}
if (!useHardwareAcceleration) {
    if (process.platform !== 'darwin') {
        app.commandLine.appendSwitch('disable-gpu');
        app.commandLine.appendSwitch('disable-software-rasterizer');
    }
    app.disableHardwareAcceleration();
}

// Fix setTimeout not reliable problem
// See https://github.com/electron/electron/issues/7079#issuecomment-325706135
app.commandLine.appendSwitch('disable-background-timer-throttling');
const gotTheLock = process.env.NODE_ENV !== 'production' || app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
}

const mGlobal: typeof global & {
    sharedDB?: typeof db.DBs;
    tray?: Tray;
    setMenuItems?: any;
    learner?: any;
} = global;
mGlobal.sharedDB = db.DBs;
if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron.time-logger');
}

const installExtensions = async () => {
    return new Promise((res, rej) => {
        const rejectTimer = setTimeout(() => {
            rej();
        }, 15000);
        const installer = require('electron-devtools-installer');
        const forceDownload = false;
        const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];
        return Promise.all(
            extensions.map((name) => installer.default(installer[name], forceDownload))
        ).catch(rej);
        clearTimeout(rejectTimer);
        res();
    });
};

const createWindow = async () => {
    win = new BrowserWindow({
        width: 1080,
        height: 800,
        minWidth: 380,
        minHeight: 562,
        frame: true,
        icon: nativeImage.createFromPath(path.join(__dirname, logo)),
        title: 'Pomodoro Logger',
        webPreferences: {
            nodeIntegrationInWorker: true,
            nodeIntegration: true,
        },
    });

    if (process.env.NODE_ENV !== 'production') {
        await installExtensions().catch(console.error);
    }

    if (process.env.NODE_ENV === 'production') {
        win.removeMenu();
    }

    if (process.env.NODE_ENV === 'development') {
        win.loadURL(`http://localhost:2003`);
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        win.loadURL(
            url.format({
                pathname: path.join(__dirname, 'index.html'),
                protocol: 'file:',
                slashes: true,
            })
        );
    }

    const handleRedirect = (e: any, url: string) => {
        if (url !== win?.webContents.getURL()) {
            e.preventDefault();
            require('electron').shell.openExternal(url);
        }
    };

    win.webContents.on('will-navigate', handleRedirect);
    win.webContents.on('new-window', handleRedirect);

    win.on('close', (event: Event) => {
        if (win) {
            win.hide();
            event.preventDefault();
        }
    });

    ipcMain.addListener('quit-app', () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('receive quit-app');
            return;
        }

        win = undefined;
        app.exit();
    });

    ipcMain.addListener('restart-app', () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('receive restart-app');
            return;
        }

        win = undefined;
        app.relaunch();
        app.exit();
    });

    ipcMain.addListener('set-tray', (event: any, src: string) => {
        const pngBuffer = nativeImage.createFromDataURL(src).toPNG();
        const imgFile = path.join(dbBaseDir, 'tray@2x.png');
        fs.writeFile(imgFile, pngBuffer, {}, () => {
            mGlobal.tray?.setImage(imgFile);
        });
    });

    if (process.platform === 'darwin') {
        let forceQuit = false;
        app.on('before-quit', () => {
            forceQuit = true;
        });

        win.on('close', (event) => {
            if (!forceQuit) {
                event.preventDefault();
                return;
            }

            win = undefined;
            app.exit();
        });
    }
};

app.on('ready', async () => {
    if (!gotTheLock) {
        return;
    }

    const img = nativeImage.createFromPath(path.join(__dirname, logo));
    img.resize({ width: 16, height: 16 });
    mGlobal.tray = new Tray(img);
    const menuItems = [
        {
            label: 'Quit',
            type: 'normal',
            click: () => {
                app.quit();
            },
        },
    ];

    // @ts-ignore
    const contextMenu = Menu.buildFromTemplate(menuItems);
    mGlobal.tray.setToolTip('Pomodoro Logger');
    if (process.platform === 'darwin') {
        mGlobal.tray.on('click', async () => {
            if (!win) {
                await createWindow();
            } else {
                win.show();
            }
        });
    } else {
        mGlobal.tray.setContextMenu(contextMenu);
        mGlobal.tray.on('double-click', async () => {
            if (!win) {
                await createWindow();
            } else {
                win.show();
            }
        });
    }

    await createWindow();

    db.DBs.settingDB.findOne({ name: 'setting' }, (err, settings) => {
        if (err) {
            console.error(err);
            return;
        }

        if (settings != null && 'autoUpdate' in settings && !settings.autoUpdate) {
            return;
        }

        update();
    });
});

function update() {
    const autoUpdater = new AutoUpdater((type: string, info: any) => {
        if (win) {
            win.webContents.send(type, info);
        }

        if (type === 'download-progress') {
            const { percent } = info;
            if (win) {
                win.setProgressBar(percent / 100);
            }
        }

        if (type === 'update-downloaded' || type === 'error') {
            if (win) {
                win.setProgressBar(-1);
            }
        }
    });

    ipcMain.on('download-update', () => {
        autoUpdater.download();
    });

    autoUpdater.checkUpdate();
}

function setMenuItems(items: { label: string; type: string; click: any }[]) {
    if (!mGlobal.tray) {
        return;
    }

    const menuItems = items.concat([
        new MenuItem({
            type: 'separator',
        }),
        {
            label: 'Open',
            type: 'normal',
            click: () => {
                if (win) {
                    win.show();
                }
            },
        },
        {
            label: 'Quit',
            type: 'normal',
            click: () => {
                win = undefined;
                app.exit();
            },
        },
    ]);
    // @ts-ignore
    const contextMenu = Menu.buildFromTemplate(menuItems);
    mGlobal.tray.setContextMenu(contextMenu);
}

mGlobal.setMenuItems = setMenuItems;
app.on('window-all-closed', () => {
    win = undefined;
    app.exit();
});

app.on('activate', () => {
    if (!win) {
        app.setName(build.productName);
        createWindow();
    } else {
        win.show();
    }
});
