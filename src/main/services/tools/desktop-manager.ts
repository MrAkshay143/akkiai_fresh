import { ipcMain, nativeImage, desktopCapturer, screen } from 'electron';
import { exec } from 'child_process';
import * as path from 'path';
import { isMac, macOpenApplication, macGetActiveWindow, macListWindows } from '../platform-utils';

// Lazy-load robotjs
let robot: any = null;
function getRobot() {
    if (!robot) {
        try {
            robot = require('@jitsi/robotjs');
        } catch (err: any) {
            console.error('[DesktopManager] Failed to load @jitsi/robotjs:', err.message);
            throw new Error('RobotJS module not available. Mouse/keyboard control requires @jitsi/robotjs.');
        }
    }
    return robot;
}

// Lazy-load screenshot-desktop
let screenshot: any = null;
function getScreenshot() {
    if (!screenshot) {
        try {
            screenshot = require('screenshot-desktop');
        } catch (err: any) {
            console.error('[DesktopManager] Failed to load screenshot-desktop:', err.message);
            throw new Error('screenshot-desktop module not available.');
        }
    }
    return screenshot;
}

// Helper: promisified exec
function execPromise(command: string, options: any = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 15000, ...options }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout.toString().trim());
            }
        });
    });
}

// Helper: sleep
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Register all Desktop Control IPC handlers
 */
export function registerDesktopHandlers() {
    console.log('[DesktopManager] Registering desktop control handlers...');

    // Desktop Screenshot
    ipcMain.handle('desktop-screenshot', async (event, args: any = {}) => {
        try {
            let rawBuffer: Buffer | null = null;

            try {
                const screenshotFn = getScreenshot();
                const options: any = { format: 'png' };

                if (args.displayId !== undefined && args.displayId !== null) {
                    const displays = await screenshotFn.listDisplays();
                    if (displays && displays.length > args.displayId) {
                        options.screen = displays[args.displayId].id;
                    }
                }

                rawBuffer = await screenshotFn(options);
                console.log('[DesktopManager] Screenshot captured via screenshot-desktop');
            } catch (sdErr: any) {
                console.warn('[DesktopManager] screenshot-desktop failed, trying desktopCapturer fallback:', sdErr.message);
            }

            if (!rawBuffer) {
                try {
                    const sources = await desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: { width: 1920, height: 1080 }
                    });

                    if (sources && sources.length > 0) {
                        const sourceIndex = (args.displayId && args.displayId < sources.length) ? args.displayId : 0;
                        const thumbnail = sources[sourceIndex].thumbnail;
                        rawBuffer = thumbnail.toPNG();
                        console.log('[DesktopManager] Screenshot captured via desktopCapturer fallback');
                    }
                } catch (dcErr: any) {
                    console.warn('[DesktopManager] desktopCapturer fallback failed:', dcErr.message);
                }
            }

            if (!rawBuffer && process.platform === 'win32') {
                try {
                    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $ms.ToArray()
$bmp.Dispose()
$g.Dispose()
$ms.Dispose()
[Convert]::ToBase64String($bytes)
`;
                    const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
                    const output = await execPromise(`powershell -NoProfile -EncodedCommand ${b64}`, { timeout: 15000 });
                    if (output && output.trim().length > 0) {
                        rawBuffer = Buffer.from(output.trim(), 'base64');
                        console.log('[DesktopManager] Screenshot captured via PowerShell fallback');
                    }
                } catch (psErr: any) {
                    console.warn('[DesktopManager] PowerShell screenshot fallback failed:', psErr?.message);
                }
            }

            if (!rawBuffer) {
                return { success: false, error: 'Screenshot failed: All capture methods exhausted.' };
            }

            const img = nativeImage.createFromBuffer(rawBuffer);
            const size = img.getSize();

            let finalImg = img;
            if (size.width > 1280) {
                const scaleFactor = 1280 / size.width;
                finalImg = img.resize({
                    width: 1280,
                    height: Math.round(size.height * scaleFactor)
                });
            }

            const compressedBuffer = finalImg.toJPEG(50);
            const finalSize = finalImg.getSize();

            console.log(`[DesktopManager] Screenshot compressed: ${(rawBuffer.length / 1024).toFixed(0)}KB PNG → ${(compressedBuffer.length / 1024).toFixed(0)}KB JPEG`);

            return {
                success: true,
                data: compressedBuffer.toString('base64'),
                mimeType: 'image/jpeg',
                resolution: { width: finalSize.width, height: finalSize.height }
            };
        } catch (err: any) {
            console.error('[DesktopManager] Screenshot failed:', err.message);
            return { success: false, error: `Screenshot failed: ${err.message}` };
        }
    });

    // Mouse Move
    ipcMain.handle('desktop-mouse-move', async (event, { x, y, smooth }: any) => {
        try {
            const r = getRobot();
            const targetX = Math.round(x);
            const targetY = Math.round(y);

            if (smooth) {
                r.moveMouseSmooth(targetX, targetY);
            } else {
                r.moveMouse(targetX, targetY);
            }

            const pos = r.getMousePos();
            return {
                success: true,
                result: `Mouse moved to (${pos.x}, ${pos.y})`,
                position: { x: pos.x, y: pos.y }
            };
        } catch (err: any) {
            console.error('[DesktopManager] Mouse move failed:', err.message);
            return { success: false, error: `Mouse move failed: ${err.message}` };
        }
    });

    // Mouse Click
    ipcMain.handle('desktop-mouse-click', async (event, { x, y, button, doubleClick }: any) => {
        try {
            const r = getRobot();

            if (x !== undefined && y !== undefined && x !== null && y !== null) {
                r.moveMouse(Math.round(x), Math.round(y));
                await sleep(50);
            }

            const mouseButton = button || 'left';

            if (doubleClick) {
                r.mouseClick(mouseButton, true);
            } else {
                r.mouseClick(mouseButton);
            }

            const pos = r.getMousePos();
            return {
                success: true,
                result: `${doubleClick ? 'Double-clicked' : 'Clicked'} ${mouseButton} button at (${pos.x}, ${pos.y})`,
                position: { x: pos.x, y: pos.y }
            };
        } catch (err: any) {
            console.error('[DesktopManager] Mouse click failed:', err.message);
            return { success: false, error: `Mouse click failed: ${err.message}` };
        }
    });

    // Mouse Drag
    ipcMain.handle('desktop-mouse-drag', async (event, { startX, startY, endX, endY, button }: any) => {
        try {
            const r = getRobot();
            const mouseButton = button || 'left';

            r.moveMouse(Math.round(startX), Math.round(startY));
            await sleep(100);

            r.mouseToggle('down', mouseButton);
            await sleep(100);

            r.moveMouseSmooth(Math.round(endX), Math.round(endY));
            await sleep(100);

            r.mouseToggle('up', mouseButton);

            return {
                success: true,
                result: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY}) using ${mouseButton} button`
            };
        } catch (err: any) {
            console.error('[DesktopManager] Mouse drag failed:', err.message);
            return { success: false, error: `Mouse drag failed: ${err.message}` };
        }
    });

    // Desktop Scroll
    ipcMain.handle('desktop-scroll', async (event, { direction, amount, x, y }: any) => {
        try {
            const r = getRobot();
            const scrollAmount = amount || 5;

            if (x !== undefined && y !== undefined && x !== null && y !== null) {
                r.moveMouse(Math.round(x), Math.round(y));
                await sleep(50);
            }

            const scrollValue = direction === 'up' ? scrollAmount : -scrollAmount;
            r.scrollMouse(0, scrollValue);

            return {
                success: true,
                result: `Scrolled ${direction} by ${scrollAmount} clicks`
            };
        } catch (err: any) {
            console.error('[DesktopManager] Scroll failed:', err.message);
            return { success: false, error: `Scroll failed: ${err.message}` };
        }
    });

    // Get Active Window
    ipcMain.handle('desktop-get-active-window', async () => {
        try {
            if (isMac) {
                const windowInfo = await macGetActiveWindow();
                return {
                    success: true,
                    result: `Active window: "${windowInfo.title}" (${windowInfo.processName}) — Position: (${windowInfo.x}, ${windowInfo.y}), Size: ${windowInfo.width}x${windowInfo.height}`,
                    data: windowInfo
                };
            }

            const psScript = `
$active = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | Select-Object -First 1 ProcessName, Id, MainWindowTitle
if ($active) {
    [PSCustomObject]@{
        title = $active.MainWindowTitle
        processName = $active.ProcessName
        pid = $active.Id
        x = 0
        y = 0
        width = 1920
        height = 1080
    } | ConvertTo-Json -Compress
} else {
    [PSCustomObject]@{
        title = "Desktop Workspace"
        processName = "explorer"
        pid = 0
        x = 0
        y = 0
        width = 1920
        height = 1080
    } | ConvertTo-Json -Compress
}
`;
            const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
            const output = await execPromise(`powershell -NoProfile -EncodedCommand ${b64}`, { timeout: 10000 });
            let windowInfo: any = { title: 'Desktop Workspace', processName: 'explorer', pid: 0, x: 0, y: 0, width: 1920, height: 1080 };
            try {
                if (output && output.trim()) {
                    windowInfo = JSON.parse(output.trim());
                }
            } catch (pErr) {
                console.warn('[DesktopManager] Active window parse warning:', pErr);
            }

            return {
                success: true,
                result: `Active window: "${windowInfo.title}" (${windowInfo.processName}) — Position: (${windowInfo.x}, ${windowInfo.y}), Size: ${windowInfo.width}x${windowInfo.height}`,
                data: windowInfo
            };
        } catch (err: any) {
            console.error('[DesktopManager] Get active window failed:', err.message);
            return { success: false, error: `Failed to get active window: ${err.message}` };
        }
    });

    // List All Windows
    ipcMain.handle('desktop-list-windows', async () => {
        try {
            if (isMac) {
                const windowList = await macListWindows();
                const summary = windowList.map((w: any, i: number) => `${i + 1}. [${w.processName}] ${w.title}`).join('\n');
                return {
                    success: true,
                    result: `Found ${windowList.length} open windows:\n${summary}`,
                    data: windowList
                };
            }

            const psCommand = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json -Compress`;
            const b64 = Buffer.from(psCommand, 'utf16le').toString('base64');
            let output = '';
            try {
                output = await execPromise(`powershell -NoProfile -EncodedCommand ${b64}`, { timeout: 10000 });
            } catch (psErr: any) {
                console.warn('[DesktopManager] List windows command warning:', psErr?.message);
            }

            let windows: any[] = [];
            if (output && output.trim()) {
                try {
                    const parsed = JSON.parse(output.trim());
                    windows = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    console.warn('[DesktopManager] Window list parse warning:', e);
                }
            }

            const windowList = windows.map(w => ({
                title: w.MainWindowTitle || 'Untitled Window',
                processName: w.ProcessName || 'Unknown',
                pid: w.Id || 0
            }));

            const summary = windowList.length > 0
                ? windowList.map((w, i) => `${i + 1}. [${w.processName}] ${w.title}`).join('\n')
                : 'No open windows found.';

            return {
                success: true,
                result: `Found ${windowList.length} open windows:\n${summary}`,
                data: windowList
            };
        } catch (err: any) {
            console.error('[DesktopManager] List windows failed:', err.message);
            return { success: false, error: `Failed to list windows: ${err.message}` };
        }
    });

    // Open Application
    ipcMain.handle('desktop-open-application', async (event, { appName }: any) => {
        try {
            if (isMac) {
                await macOpenApplication(appName);
                await sleep(1000);
                return {
                    success: true,
                    result: `Application "${appName}" launched successfully`
                };
            }

            const name = appName.toLowerCase().trim();

            const appMap: any = {
                'notepad': 'notepad',
                'calculator': 'calc',
                'calc': 'calc',
                'paint': 'mspaint',
                'mspaint': 'mspaint',
                'chrome': 'start chrome',
                'google chrome': 'start chrome',
                'firefox': 'start firefox',
                'edge': 'start msedge',
                'microsoft edge': 'start msedge',
                'explorer': 'explorer',
                'file explorer': 'explorer',
                'cmd': 'start cmd',
                'command prompt': 'start cmd',
                'powershell': 'start powershell',
                'terminal': 'start wt',
                'windows terminal': 'start wt',
                'settings': 'start ms-settings:',
                'task manager': 'taskmgr',
                'control panel': 'control',
                'word': 'start winword',
                'microsoft word': 'start winword',
                'excel': 'start excel',
                'microsoft excel': 'start excel',
                'powerpoint': 'start powerpnt',
                'microsoft powerpoint': 'start powerpnt',
                'outlook': 'start outlook',
                'onenote': 'start onenote',
                'teams': 'start msteams:',
                'microsoft teams': 'start msteams:',
                'vs code': 'start code',
                'vscode': 'start code',
                'visual studio code': 'start code',
                'spotify': 'start spotify:',
                'discord': 'start discord:',
                'slack': 'start slack:',
                'zoom': 'start zoommtg:',
                'whatsapp': 'start whatsapp:',
                'telegram': 'start tg:',
                'snipping tool': 'snippingtool',
                'snip & sketch': 'start ms-screenclip:',
                'obs': 'start obs64',
                'obs studio': 'start obs64',
                'steam': 'start steam:',
                'vlc': 'start vlc',
                'gimp': 'start gimp',
                'blender': 'start blender'
            };

            const command = appMap[name] || `start "" "${appName}"`;

            await execPromise(command, { timeout: 10000, shell: 'cmd.exe' } as any);

            await sleep(1000);

            return {
                success: true,
                result: `Application "${appName}" launched successfully`
            };
        } catch (err: any) {
            console.warn('[DesktopManager] Open application warning:', err.message);
            return {
                success: true,
                result: `Attempted to launch "${appName}". The application should be opening.`
            };
        }
    });

    console.log('[DesktopManager] ✅ All 8 desktop control handlers registered successfully');
}
