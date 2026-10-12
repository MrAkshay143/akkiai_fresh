import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import qrcode from 'qrcode';

const BOT_SIGNATURE = '[AKKI_AI_BOT]';

const silentLogger = {
    level: 'silent',
    trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {},
    child: () => silentLogger,
};

export interface WhatsAppState {
    status: 'disconnected' | 'connecting' | 'connected' | 'scan_qr' | 'qr_error' | 'reconnecting' | 'initializing' | 'error';
    reason: string | null;
    isReady: boolean;
    isInitializing: boolean;
    qrCode: string | null;
    qrError: string | null;
    qrGeneratedAt: number | null;
    reconnectAttempts: number;
}

export class WhatsAppManager {
    private mainWindow: BrowserWindow | null = null;
    private sock: any = null;
    private isReady = false;
    private isInitializing = false;
    private manualLogout = false;

    private status: WhatsAppState['status'] = 'disconnected';
    private statusReason: string | null = null;
    private qrCode: string | null = null;
    private qrError: string | null = null;
    private qrGeneratedAt: number | null = null;

    private sessionDir: string;
    private recentlySentIds = new Set<string>();
    private maxRecentIds = 50;

    private reconnectTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 8;

    private initTimeout: NodeJS.Timeout | null = null;
    private maxInitTimeMs = 45000;

    private _saveCreds: any = null;

    constructor(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
        this.sessionDir = path.join(app.getPath('userData'), 'whatsapp_auth');
    }

    public updateMainWindow(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
    }
    
    public setMainWindow(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
    }

    public getState(): WhatsAppState {
        return {
            status: this.status,
            reason: this.statusReason,
            isReady: this.isReady,
            isInitializing: this.isInitializing,
            qrCode: this.qrCode,
            qrError: this.qrError,
            qrGeneratedAt: this.qrGeneratedAt,
            reconnectAttempts: this.reconnectAttempts,
        };
    }

    private setStatus(status: WhatsAppState['status'], extra: any = {}) {
        this.status = status;
        this.statusReason = extra.reason || null;
        this.sendToFrontend('status', { status, ...extra });
    }

    private sendToFrontend(event: string, data: any) {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            const allWindows = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
            this.mainWindow = allWindows.length > 0 ? allWindows[0] : null;
        }
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        try {
            this.mainWindow.webContents.send('whatsapp-event', { event, data });
        } catch (error: any) {
            console.error('[WhatsApp] Failed to send IPC event:', error.message || error);
        }
    }

    private ensureRuntimeDirectories() {
        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }
    }

    private clearInitTimeout() {
        if (this.initTimeout) {
            clearTimeout(this.initTimeout);
            this.initTimeout = null;
        }
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private clearAllTimers() {
        this.clearInitTimeout();
        this.clearReconnectTimer();
    }

    private startInitTimeout() {
        this.clearInitTimeout();
        this.initTimeout = setTimeout(() => {
            if (this.isReady || this.status === 'scan_qr') return;
            console.error('[WhatsApp] Initialization timeout (no QR / no connection).');
            this.isInitializing = false;
            this.qrError = 'WhatsApp connect timed out. Check your internet and retry.';
            this.setStatus('disconnected', { reason: 'init-timeout' });
            this.sendToFrontend('qr-error', {
                error: this.qrError,
                code: 'INIT_TIMEOUT',
                retryable: true,
            });
        }, this.maxInitTimeMs);
    }

    private scheduleReconnect(reason = 'unknown') {
        if (this.manualLogout) return;
        if (this.reconnectTimer) return;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WhatsApp] Reconnect limit reached. Waiting for manual restart.');
            this.setStatus('disconnected', { reason: 'reconnect-limit-reached' });
            return;
        }

        this.reconnectAttempts += 1;
        const delayMs = Math.min(30000, 2000 * (2 ** (this.reconnectAttempts - 1)));
        this.setStatus('reconnecting', { reason, attempt: this.reconnectAttempts, delayMs });

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.startSocket().catch((err: any) => {
                console.error('[WhatsApp] Reconnect attempt failed:', err.message || err);
                this.scheduleReconnect('reconnect-error');
            });
        }, delayMs);
    }

    public async initialize(options: any = {}) {
        const { isReconnect = false } = options;

        if (this.isInitializing) {
            console.log('[WhatsApp] Initialize skipped (already initializing).');
            return { success: this.isReady, state: this.getState() };
        }
        if (this.sock && this.isReady) {
            console.log('[WhatsApp] Initialize skipped (already connected).');
            this.setStatus('connected');
            return { success: true, state: this.getState() };
        }

        this.manualLogout = false;
        this.ensureRuntimeDirectories();
        this.clearReconnectTimer();

        this.isInitializing = true;
        this.isReady = false;
        this.qrCode = null;
        this.qrError = null;
        this.qrGeneratedAt = null;
        this.setStatus(isReconnect ? 'reconnecting' : 'initializing', {
            attempt: this.reconnectAttempts || 0,
        });

        this.startInitTimeout();

        try {
            await this.startSocket();
            return { success: this.isReady, state: this.getState(), error: this.qrError || undefined };
        } catch (error: any) {
            const errorMessage = String(error?.message || error || '');
            console.error('[WhatsApp] Initialize error:', errorMessage);
            this.clearInitTimeout();
            this.isInitializing = false;
            this.isReady = false;
            this.qrError = errorMessage || 'Initialization failed';
            this.setStatus('disconnected', { reason: errorMessage || 'init-error' });
            this.sendToFrontend('qr-error', {
                error: this.qrError,
                code: 'INIT_ERROR',
                retryable: true,
            });
            this.scheduleReconnect('init-error');
            return { success: false, state: this.getState(), error: errorMessage || 'Initialization failed' };
        }
    }

    private async startSocket() {
        const modName = '@whiskeysockets/baileys';
        let baileysMod: any;
        try {
            baileysMod = await Function('m', 'return import(m)')(modName);
        } catch (err) {
            baileysMod = require('@whiskeysockets/baileys');
        }
        
        const makeWASocket = baileysMod.makeWASocket || baileysMod.default;
        const useMultiFileAuthState = baileysMod.useMultiFileAuthState;
        const DisconnectReason = baileysMod.DisconnectReason;
        const fetchLatestBaileysVersion = baileysMod.fetchLatestBaileysVersion;
        const Browsers = baileysMod.Browsers;

        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
        this._saveCreds = saveCreds;

        let version;
        try {
            ({ version } = await fetchLatestBaileysVersion());
        } catch (_) {
            version = undefined;
        }

        if (this.sock) {
            try { this.sock.ev.removeAllListeners(); } catch (_) {}
            try { this.sock.end(undefined); } catch (_) {}
            this.sock = null;
        }

        const sock = makeWASocket({
            version,
            auth: state,
            logger: silentLogger,
            printQRInTerminal: false,
            browser: (Browsers && Browsers.appropriate)
                ? Browsers.appropriate('Akki Ai')
                : ['Akki Ai', 'Chrome', '120.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false,
            getMessage: async () => ({ conversation: '' }),
        });
        this.sock = sock;

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', (update: any) => this.handleConnectionUpdate(update, DisconnectReason));
        sock.ev.on('messages.upsert', (payload: any) => {
            this.handleMessagesUpsert(payload).catch((err: any) => {
                console.error('[WhatsApp] message handler error:', err.message || err);
            });
        });
    }

    private async handleConnectionUpdate(update: any, DisconnectReason: any) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            this.isInitializing = false;
            this.clearInitTimeout();
            try {
                const url = await qrcode.toDataURL(qr, {
                    errorCorrectionLevel: 'M',
                    type: 'image/png',
                    margin: 1,
                });
                this.qrCode = url;
                this.qrError = null;
                this.qrGeneratedAt = Date.now();
                this.setStatus('scan_qr');
                this.sendToFrontend('qr-code', { url, generatedAt: this.qrGeneratedAt });
            } catch (error: any) {
                const errMsg = error.message || String(error);
                console.error('[WhatsApp] QR encode error:', errMsg);
                this.qrCode = null;
                this.qrError = `QR generation failed: ${errMsg}`;
                this.setStatus('qr_error', { reason: 'qr-encode-failed' });
                this.sendToFrontend('qr-error', { error: this.qrError, code: 'QR_ENCODE_FAILED', retryable: true });
            }
            return;
        }

        if (connection === 'connecting') {
            if (!this.isReady) this.setStatus('initializing');
            return;
        }

        if (connection === 'open') {
            this.clearInitTimeout();
            this.clearReconnectTimer();
            this.isInitializing = false;
            this.isReady = true;
            this.qrCode = null;
            this.qrError = null;
            this.qrGeneratedAt = null;
            this.reconnectAttempts = 0;
            this.setStatus('connected');
            console.log('[WhatsApp] Connected.');
            return;
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            this.clearInitTimeout();
            this.isInitializing = false;
            this.isReady = false;
            this.qrCode = null;

            if (this.manualLogout) {
                this.setStatus('disconnected', { reason: 'manual-logout' });
                return;
            }

            if (DisconnectReason && statusCode === DisconnectReason.loggedOut) {
                console.warn('[WhatsApp] Logged out from phone. Clearing session.');
                this.wipeSession();
                this.qrError = 'WhatsApp was unlinked from your phone. Please scan the QR again.';
                this.setStatus('disconnected', { reason: 'logged-out' });
                this.sendToFrontend('qr-error', { error: this.qrError, code: 'LOGGED_OUT', retryable: true });
                return;
            }

            const reason = statusCode === 515 ? 'restart-required' : `closed-${statusCode || 'unknown'}`;
            console.warn(`[WhatsApp] Connection closed (${reason}). Reconnecting...`);
            if (statusCode === 515) {
                this.setStatus('reconnecting', { reason });
                this.startSocket().catch(() => this.scheduleReconnect(reason));
            } else {
                this.scheduleReconnect(reason);
            }
        }
    }

    private unwrapMessage(message: any) {
        let content = message || {};
        if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message;
        if (content.documentWithCaptionMessage?.message) content = content.documentWithCaptionMessage.message;
        return content;
    }

    private async handleMessagesUpsert({ messages, type }: any) {
        if (type !== 'notify' && type !== 'append') return;
        if (!this.sock) return;

        for (const msg of messages) {
            if (!msg.message || !msg.key) continue;

            const chatId = msg.key.remoteJid || '';
            if (!chatId || chatId === 'status@broadcast' || chatId.endsWith('@g.us')) continue;

            if (!msg.key.fromMe) continue;

            const myNumber = (this.sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
            const myLid = (this.sock.user?.lid || '').replace(/:.*@/, '@').replace(/@.*/, '');
            const chatNumber = chatId.replace(/@.*/, '');
            const isSelfChat = (myNumber && chatNumber === myNumber) || (myLid && chatNumber === myLid);
            if (!isSelfChat) continue;

            if (this.recentlySentIds.has(msg.key.id)) continue;

            const content = this.unwrapMessage(msg.message);

            let body = '';
            if (content.conversation) body = content.conversation;
            else if (content.extendedTextMessage?.text) body = content.extendedTextMessage.text;

            if (body) {
                body = String(body).trim();
                if (!body || body.includes(BOT_SIGNATURE)) continue;
                console.log('[WhatsApp] ✅ Forwarding text to Akki:', body.substring(0, 60));
                this.sendToFrontend('mobile-message', {
                    message: body,
                    chatId,
                    timestamp: Number(msg.messageTimestamp) || Date.now(),
                    messageId: msg.key.id || null,
                });
                continue;
            }
        }
    }

    public async sendReply(chatId: string, text: string) {
        if (!this.sock || !this.isReady) {
            console.warn('[WhatsApp] Send skipped. Client not ready.');
            return false;
        }

        const targetChatId = String(chatId || '').trim();
        const messageText = String(text || '').trim();
        if (!targetChatId || !messageText) {
            console.warn('[WhatsApp] Send skipped. Invalid chatId or message.');
            return false;
        }

        try {
            const replyText = `${messageText}\n\n_${BOT_SIGNATURE}_`;
            const sent = await this.sock.sendMessage(targetChatId, { text: replyText });
            const sentId = sent?.key?.id;
            if (sentId) {
                this.recentlySentIds.add(sentId);
                if (this.recentlySentIds.size > this.maxRecentIds) {
                    this.recentlySentIds.delete(this.recentlySentIds.values().next().value!);
                }
            }
            return true;
        } catch (error: any) {
            console.error('[WhatsApp] Send error:', error.message || error);
            return false;
        }
    }

    private wipeSession() {
        try {
            if (fs.existsSync(this.sessionDir)) {
                fs.rmSync(this.sessionDir, { recursive: true, force: true });
            }
        } catch (error: any) {
            console.warn('[WhatsApp] Failed to wipe session:', error.message || error);
        }
    }

    private async destroySocket() {
        if (!this.sock) return;
        const sock = this.sock;
        this.sock = null;
        try { sock.ev.removeAllListeners(); } catch (_) {}
        try { sock.end(undefined); } catch (_) {}
    }

    public async logout() {
        this.manualLogout = true;
        this.clearAllTimers();
        this.reconnectAttempts = 0;
        this.isReady = false;
        this.isInitializing = false;
        this.qrCode = null;

        try {
            if (this.sock) await this.sock.logout();
        } catch (error: any) {
            console.warn('[WhatsApp] Logout error:', error.message || error);
        }
        await this.destroySocket();
        this.wipeSession();
        this.setStatus('disconnected', { reason: 'manual-logout' });
        return { success: true, state: this.getState() };
    }

    public async shutdown() {
        this.manualLogout = true;
        this.clearAllTimers();
        this.isReady = false;
        this.isInitializing = false;
        this.qrCode = null;
        await this.destroySocket();
    }
}

export const whatsAppManager = new WhatsAppManager(null);
