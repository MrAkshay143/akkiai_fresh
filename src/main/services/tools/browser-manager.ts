import { chromium, Browser, BrowserContext, Page } from 'playwright';

export class BrowserManagerService {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private activePage: Page | null = null;

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
                console.log(`[BrowserManager] Successfully launched browser with options:`, opts);
                return this.browser;
            } catch (err: any) {
                lastError = err;
                console.warn(`[BrowserManager] Launch attempt failed (${JSON.stringify(opts)}):`, err?.message || err);
            }
        }

        throw new Error(`Unable to launch any browser instance. Details: ${lastError?.message || lastError}`);
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
        }
    }
}

export const browserManager = new BrowserManagerService();
