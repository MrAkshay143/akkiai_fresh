import { chromium, Browser, BrowserContext, Page } from 'playwright';

const KNOWN_DEVICES: Record<string, { viewport: { width: number; height: number }; userAgent: string }> = {
    'iPhone 12': { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' },
    'iPhone 14': { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
    'iPad Pro': { viewport: { width: 1024, height: 1366 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' },
    'Samsung Galaxy S20': { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36' },
    'Pixel 5': { viewport: { width: 393, height: 851 }, userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36' },
    'Desktop 1280': { viewport: { width: 1280, height: 720 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    'Desktop 1920': { viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
};

export class BrowserManagerService {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private activePage: Page | null = null;
    private consoleMessages: Array<{ level: string; text: string; timestamp: number }> = [];

    constructor() {}

    async launch(): Promise<Browser> {
        if (this.browser) return this.browser;

        const launchOptions: any[] = [
            { headless: false },
            { channel: 'msedge', headless: false },
            { channel: 'chrome', headless: false },
            { channel: 'msedge', headless: true },
            { headless: true },
        ];

        let lastError: any = null;
        for (const opts of launchOptions) {
            try {
                this.browser = await chromium.launch(opts);
                this.context = await this.browser.newContext();
                this.activePage = await this.context.newPage();
                this.attachPageListeners(this.activePage);
                console.log(`[BrowserManager] Successfully launched browser with options:`, opts);
                return this.browser;
            } catch (err: any) {
                lastError = err;
                console.warn(`[BrowserManager] Launch attempt failed (${JSON.stringify(opts)}):`, err?.message || err);
            }
        }

        throw new Error(`Unable to launch any browser instance. Details: ${lastError?.message || lastError}`);
    }

    private attachPageListeners(page: Page) {
        page.on('console', (msg) => {
            this.consoleMessages.push({
                level: msg.type(),
                text: msg.text(),
                timestamp: Date.now(),
            });
            if (this.consoleMessages.length > 250) {
                this.consoleMessages.shift();
            }
        });
    }

    async getPage(): Promise<Page> {
        if (!this.activePage || this.activePage.isClosed()) {
            await this.launch();
        }
        return this.activePage!;
    }

    async navigate(url: string) {
        try {
            const page = await this.getPage();
            let targetUrl = url;
            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                targetUrl = 'https://' + targetUrl;
            }
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return {
                success: true,
                toolName: 'browser_navigate',
                result: `Navigated to ${targetUrl}`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Navigate error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_navigate',
                error: `Failed to navigate: ${err?.message || err}`
            };
        }
    }

    async screenshot() {
        try {
            const page = await this.getPage();
            const buffer = await page.screenshot({ timeout: 15000 });
            return {
                success: true,
                toolName: 'browser_screenshot',
                result: 'Screenshot taken',
                data: buffer.toString('base64')
            };
        } catch (err: any) {
            console.error('[BrowserManager] Screenshot error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_screenshot',
                error: `Failed to take screenshot: ${err?.message || err}`
            };
        }
    }

    async extract() {
        try {
            const page = await this.getPage();
            const content = await page.content();
            return {
                success: true,
                toolName: 'browser_get_html',
                result: 'Extracted HTML',
                data: content
            };
        } catch (err: any) {
            console.error('[BrowserManager] Extract error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_get_html',
                error: `Failed to extract HTML: ${err?.message || err}`
            };
        }
    }

    async extractText(selector?: string) {
        try {
            const page = await this.getPage();
            let text = '';
            if (selector) {
                const el = await page.$(selector);
                if (el) {
                    text = (await el.innerText()) || '';
                } else {
                    return {
                        success: false,
                        toolName: 'browser_extract_text',
                        error: `Element "${selector}" not found.`
                    };
                }
            } else {
                text = await page.evaluate(() => document.body.innerText.substring(0, 50000));
            }
            return {
                success: true,
                toolName: 'browser_extract_text',
                result: text.substring(0, 50000)
            };
        } catch (err: any) {
            console.error('[BrowserManager] Extract text error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_extract_text',
                error: `Failed to extract text: ${err?.message || err}`
            };
        }
    }

    async click(selector: string) {
        try {
            const page = await this.getPage();
            await page.click(selector, { timeout: 10000 });
            return {
                success: true,
                toolName: 'browser_click',
                result: `Clicked on ${selector}`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Click error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_click',
                error: `Failed to click ${selector}: ${err?.message || err}`
            };
        }
    }

    async hover(selector: string) {
        try {
            const page = await this.getPage();
            await page.hover(selector, { timeout: 10000 });
            return {
                success: true,
                toolName: 'browser_hover',
                result: `Hovered over ${selector}`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Hover error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_hover',
                error: `Failed to hover over ${selector}: ${err?.message || err}`
            };
        }
    }

    async pressKey(key: string) {
        try {
            const page = await this.getPage();
            await page.keyboard.press(key);
            return {
                success: true,
                toolName: 'browser_press_key',
                result: `Pressed '${key}' in browser`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Press key error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_press_key',
                error: `Failed to press key ${key}: ${err?.message || err}`
            };
        }
    }

    async emulateDevice(deviceName: string) {
        try {
            const page = await this.getPage();
            const device = KNOWN_DEVICES[deviceName];
            if (!device) {
                const available = Object.keys(KNOWN_DEVICES).join(', ');
                return {
                    success: false,
                    toolName: 'browser_emulate_device',
                    error: `Unknown device "${deviceName}". Available: ${available}`
                };
            }
            await page.setViewportSize(device.viewport);
            if (this.context) {
                await page.evaluate((ua) => {
                    Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true });
                }, device.userAgent);
            }
            return {
                success: true,
                toolName: 'browser_emulate_device',
                result: `Emulating ${deviceName} (${device.viewport.width}x${device.viewport.height})`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Emulate device error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_emulate_device',
                error: `Failed to emulate device: ${err?.message || err}`
            };
        }
    }

    async getConsole(level?: string) {
        try {
            const messages = level
                ? this.consoleMessages.filter((m) => m.level === level)
                : this.consoleMessages;
            return {
                success: true,
                toolName: 'browser_get_console',
                result: `${messages.length} console message(s)${level ? ` of type "${level}"` : ''}`,
                data: { messages, count: messages.length }
            };
        } catch (err: any) {
            console.error('[BrowserManager] Get console error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_get_console',
                error: `Failed to get console messages: ${err?.message || err}`
            };
        }
    }

    async getTabs() {
        try {
            if (!this.context) await this.launch();
            const pages = this.context!.pages();
            const tabs = [];
            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                tabs.push({
                    index: i,
                    title: await p.title().catch(() => 'Untitled'),
                    url: p.url(),
                    isActive: p === this.activePage
                });
            }
            return {
                success: true,
                toolName: 'browser_get_tabs',
                result: `${tabs.length} open tab(s)`,
                data: { tabs, count: tabs.length }
            };
        } catch (err: any) {
            console.error('[BrowserManager] Get tabs error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_get_tabs',
                error: `Failed to get tabs: ${err?.message || err}`
            };
        }
    }

    async goBack() {
        try {
            const page = await this.getPage();
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
            const title = await page.title().catch(() => '');
            return {
                success: true,
                toolName: 'browser_go_back',
                result: `Navigated back to: ${page.url()} (${title})`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Go back error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_go_back',
                error: `Failed to go back: ${err?.message || err}`
            };
        }
    }

    async handleDialog(accept: boolean = true, promptText?: string, timeoutMs: number = 10000) {
        try {
            const page = await this.getPage();
            page.once('dialog', async (dialog) => {
                if (accept) {
                    await dialog.accept(promptText || '');
                } else {
                    await dialog.dismiss();
                }
            });
            return {
                success: true,
                toolName: 'browser_handle_dialog',
                result: `Dialog handler armed (${accept ? 'accept' : 'dismiss'})`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Handle dialog error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_handle_dialog',
                error: `Failed to arm dialog handler: ${err?.message || err}`
            };
        }
    }

    async setGeolocation(latitude?: number, longitude?: number, accuracy: number = 100, clear: boolean = false) {
        try {
            if (!this.context) await this.launch();
            if (clear) {
                await this.context!.setGeolocation(null);
            } else if (latitude !== undefined && longitude !== undefined) {
                await this.context!.setGeolocation({ latitude, longitude, accuracy });
                await this.context!.grantPermissions(['geolocation']);
            }
            return {
                success: true,
                toolName: 'browser_set_geolocation',
                result: clear ? 'Cleared browser geolocation override' : `Set browser geolocation to ${latitude}, ${longitude}`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Set geolocation error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_set_geolocation',
                error: `Failed to set geolocation: ${err?.message || err}`
            };
        }
    }

    async fill(selector: string, value: string) {
        try {
            const page = await this.getPage();
            await page.fill(selector, value, { timeout: 10000 });
            return {
                success: true,
                toolName: 'browser_type',
                result: `Filled ${selector} with ${value}`
            };
        } catch (err: any) {
            console.error('[BrowserManager] Fill error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_type',
                error: `Failed to fill ${selector}: ${err?.message || err}`
            };
        }
    }

    async scrape() {
        try {
            const page = await this.getPage();
            const text = await page.evaluate(() => document.body.innerText);
            return {
                success: true,
                toolName: 'browser_scrape',
                result: 'Scraped text',
                data: text
            };
        } catch (err: any) {
            console.error('[BrowserManager] Scrape error:', err?.message || err);
            return {
                success: false,
                toolName: 'browser_scrape',
                error: `Failed to scrape text: ${err?.message || err}`
            };
        }
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
            }
        } catch (err: any) {
            console.warn('[BrowserManager] Error during close:', err?.message || err);
        } finally {
            this.browser = null;
            this.context = null;
            this.activePage = null;
            this.consoleMessages = [];
        }
    }
}

export const browserManager = new BrowserManagerService();
