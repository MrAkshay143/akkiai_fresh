// Info Panel Window Manager for AKKI AI
// Implements floating frameless HUD browser window for open_info_panel(panel_id, title, color, body)
// supporting cyan, amber, crimson, emerald, blue cyberpunk themes, single-instance update, and safe content rendering.

import { BrowserWindow, shell } from 'electron';
import type { InfoPanelPayload } from '../../shared/types';
import { getMainWindow } from './main-window';
import { closeAllVideoWindows } from './video-window';

interface ThemeConfig {
  primary: string;
  glow: string;
  border: string;
  bgGradient: string;
  badgeBg: string;
}

const THEME_CONFIGS: Record<InfoPanelPayload['theme'], ThemeConfig> = {
  cyan: {
    primary: '#00f0ff',
    glow: 'rgba(0, 240, 255, 0.45)',
    border: 'rgba(0, 240, 255, 0.5)',
    bgGradient: 'linear-gradient(135deg, rgba(8, 20, 36, 0.95) 0%, rgba(13, 10, 28, 0.98) 100%)',
    badgeBg: 'rgba(0, 240, 255, 0.15)',
  },
  amber: {
    primary: '#ffb703',
    glow: 'rgba(255, 183, 3, 0.45)',
    border: 'rgba(255, 183, 3, 0.5)',
    bgGradient: 'linear-gradient(135deg, rgba(32, 22, 10, 0.95) 0%, rgba(13, 10, 28, 0.98) 100%)',
    badgeBg: 'rgba(255, 183, 3, 0.15)',
  },
  crimson: {
    primary: '#ff0055',
    glow: 'rgba(255, 0, 85, 0.45)',
    border: 'rgba(255, 0, 85, 0.5)',
    bgGradient: 'linear-gradient(135deg, rgba(36, 8, 20, 0.95) 0%, rgba(13, 10, 28, 0.98) 100%)',
    badgeBg: 'rgba(255, 0, 85, 0.15)',
  },
  emerald: {
    primary: '#00f59b',
    glow: 'rgba(0, 245, 155, 0.45)',
    border: 'rgba(0, 245, 155, 0.5)',
    bgGradient: 'linear-gradient(135deg, rgba(8, 36, 22, 0.95) 0%, rgba(13, 10, 28, 0.98) 100%)',
    badgeBg: 'rgba(0, 245, 155, 0.15)',
  },
  blue: {
    primary: '#3a86ff',
    glow: 'rgba(58, 134, 255, 0.45)',
    border: 'rgba(58, 134, 255, 0.5)',
    bgGradient: 'linear-gradient(135deg, rgba(10, 20, 42, 0.95) 0%, rgba(13, 10, 28, 0.98) 100%)',
    badgeBg: 'rgba(58, 134, 255, 0.15)',
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInline(text: string): string {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #ffffff; font-weight: 600;">$1</strong>');
  escaped = escaped.replace(/\*(.*?)\*/g, '<em style="color: #e2e8f0;">$1</em>');
  escaped = escaped.replace(
    /`([^`]+)`/g,
    '<code style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 1px 5px; font-size: 11px; font-family: monospace; color: #38bdf8;">$1</code>'
  );
  escaped = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline; text-underline-offset: 2px;">$1</a>'
  );
  return escaped;
}

function parseTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((c) => c.trim());
}

function isTableDelimiter(line: string): boolean {
  const cells = parseTableCells(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c));
}

function renderSafeMarkdown(content: string, primaryColor: string): string {
  const lines = content.split('\n');
  const renderedLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        const codeContent = escapeHtml(codeBlockBuffer.join('\n'));
        renderedLines.push(
          `<pre style="background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 12px; font-family: 'Consolas', monospace; font-size: 12px; color: #a5f3fc; overflow-x: auto; margin: 12px 0;"><code>${codeContent}</code></pre>`
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        if (inList) {
          renderedLines.push('</ul>');
          inList = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Table detection: line contains '|' and the following line is a table delimiter
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableDelimiter(lines[i + 1])
    ) {
      if (inList) {
        renderedLines.push('</ul>');
        inList = false;
      }
      const headers = parseTableCells(trimmed);
      i++; // Skip the delimiter line
      const rows: string[][] = [];

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (!nextLine.includes('|') || nextLine === '') {
          break;
        }
        i++;
        rows.push(parseTableCells(lines[i]));
      }

      const theadHtml = `<thead><tr style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.08);">${headers
        .map(
          (h) =>
            `<th style="padding: 10px 14px; font-weight: 600; font-family: monospace; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: ${primaryColor}; text-align: left;">${formatInline(
              h
            )}</th>`
        )
        .join('')}</tr></thead>`;

      const tbodyHtml = `<tbody>${rows
        .map(
          (row, rIdx) =>
            `<tr style="background: ${
              rIdx % 2 === 1 ? 'rgba(255, 255, 255, 0.015)' : 'transparent'
            }; border-bottom: 1px solid rgba(255, 255, 255, 0.03);">${row
              .map(
                (cell) =>
                  `<td style="padding: 8px 14px; font-size: 12px; color: rgba(255, 255, 255, 0.7); font-weight: 300; line-height: 1.6;">${formatInline(
                    cell
                  )}</td>`
              )
              .join('')}</tr>`
        )
        .join('')}</tbody>`;

      renderedLines.push(
        `<div style="margin: 16px 0; overflow-x: auto; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(0, 0, 0, 0.35); box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);"><table style="width: 100%; border-collapse: collapse; text-align: left;">${theadHtml}${tbodyHtml}</table></div>`
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      if (inList) {
        renderedLines.push('</ul>');
        inList = false;
      }
      renderedLines.push(
        `<h1 style="font-size: 18px; font-weight: 700; color: ${primaryColor}; margin: 16px 0 8px 0; letter-spacing: 0.5px;">${formatInline(
          trimmed.slice(2)
        )}</h1>`
      );
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        renderedLines.push('</ul>');
        inList = false;
      }
      renderedLines.push(
        `<h2 style="font-size: 15px; font-weight: 600; color: #f1f5f9; margin: 14px 0 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 4px;">${formatInline(
          trimmed.slice(3)
        )}</h2>`
      );
    } else if (trimmed.startsWith('### ')) {
      if (inList) {
        renderedLines.push('</ul>');
        inList = false;
      }
      renderedLines.push(
        `<h3 style="font-size: 13px; font-weight: 600; color: ${primaryColor}; margin: 12px 0 4px 0;">${formatInline(
          trimmed.slice(4)
        )}</h3>`
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        renderedLines.push('<ul style="margin: 6px 0 10px 0; padding-left: 20px; list-style: square;">');
        inList = true;
      }
      renderedLines.push(
        `<li style="margin-bottom: 4px; color: #cbd5e1; line-height: 1.5; font-size: 13px;">${formatInline(
          trimmed.slice(2)
        )}</li>`
      );
    } else if (trimmed === '') {
      if (inList) {
        renderedLines.push('</ul>');
        inList = false;
      }
      renderedLines.push('<div style="height: 8px;"></div>');
    } else {
      if (inList) {
        renderedLines.push('</ul>');
        inList = false;
      }
      renderedLines.push(
        `<p style="margin: 6px 0; color: #cbd5e1; line-height: 1.6; font-size: 13px;">${formatInline(
          trimmed
        )}</p>`
      );
    }
  }

  if (inCodeBlock && codeBlockBuffer.length > 0) {
    const codeContent = escapeHtml(codeBlockBuffer.join('\n'));
    renderedLines.push(
      `<pre style="background: rgba(0,0,0,0.6); padding: 10px; border-radius: 6px; font-size: 12px;"><code>${codeContent}</code></pre>`
    );
  }
  if (inList) {
    renderedLines.push('</ul>');
  }

  return renderedLines.join('');
}

function generatePanelHtml(payload: InfoPanelPayload): string {
  const theme = THEME_CONFIGS[payload.theme] || THEME_CONFIGS.cyan;
  const escapedTitle = escapeHtml(payload.title);
  const escapedId = escapeHtml(payload.panelId);
  const renderedContent = renderSafeMarkdown(payload.content, theme.primary);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: transparent;
      color: #e2e8f0;
      height: 100vh;
      overflow: hidden;
      padding: 10px;
    }
    .hud-window {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: ${theme.bgGradient};
      border: 1px solid ${theme.border};
      border-radius: 12px;
      box-shadow: 0 0 25px ${theme.glow}, inset 0 0 15px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(20px);
      overflow: hidden;
    }
    .hud-header {
      -webkit-app-region: drag;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      background: rgba(0, 0, 0, 0.45);
      border-bottom: 1px solid ${theme.border};
      flex-shrink: 0;
    }
    .hud-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .hud-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${theme.primary};
      box-shadow: 0 0 8px ${theme.primary};
      animation: pulse 2s infinite ease-in-out;
      flex-shrink: 0;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .hud-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .hud-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      background: ${theme.badgeBg};
      color: ${theme.primary};
      border: 1px solid ${theme.border};
      letter-spacing: 1px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .hud-close-btn {
      -webkit-app-region: no-drag;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.05);
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-size: 14px;
      font-weight: bold;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .hud-close-btn:hover {
      background: rgba(255, 0, 85, 0.3);
      border-color: #ff0055;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(255, 0, 85, 0.5);
    }
    .hud-body {
      -webkit-app-region: no-drag;
      flex: 1;
      padding: 16px 20px;
      overflow-y: auto;
      user-select: text;
    }
    .hud-body::-webkit-scrollbar {
      width: 6px;
    }
    .hud-body::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
    }
    .hud-body::-webkit-scrollbar-thumb {
      background: ${theme.border};
      border-radius: 3px;
    }
    .hud-footer {
      height: 32px;
      padding: 0 16px;
      background: rgba(0, 0, 0, 0.4);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
      font-family: monospace;
      flex-shrink: 0;
    }
    .hud-footer-status {
      display: flex;
      align-items: center;
      gap: 6px;
      color: ${theme.primary};
    }
  </style>
</head>
<body>
  <div class="hud-window">
    <div class="hud-header">
      <div class="hud-title-wrap">
        <span class="hud-dot"></span>
        <span class="hud-title">${escapedTitle}</span>
        <span class="hud-badge">${escapeHtml(payload.theme)}</span>
      </div>
      <a href="#close" class="hud-close-btn" title="Close Panel">✕</a>
    </div>
    <div class="hud-body">
      ${renderedContent}
    </div>
    <div class="hud-footer">
      <div class="hud-footer-status">
        <span>●</span>
        <span>HUD STREAM // SYNCED</span>
      </div>
      <span>ID: ${escapedId}</span>
    </div>
  </div>
</body>
</html>`;
}

export class InfoPanelWindowManager {
  private panels = new Map<string, { window: BrowserWindow | null; payload: InfoPanelPayload }>();

  public async openPanel(payload: InfoPanelPayload): Promise<void> {
    // SINGLETON ENFORCEMENT: Close all other active info panels to prevent stacking
    for (const [existingId, entry] of this.panels.entries()) {
      if (existingId !== payload.panelId) {
        if (entry.window && !entry.window.isDestroyed()) {
          entry.window.close();
        }
        this.panels.delete(existingId);
      }
    }

    const existing = this.panels.get(payload.panelId);

    if (existing && existing.window && !existing.window.isDestroyed()) {
      // Single-instance update: Update content and focus
      existing.payload = payload;
      const html = generatePanelHtml(payload);
      await existing.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      if (existing.window.isMinimized()) {
        existing.window.restore();
      }
      existing.window.show();
      existing.window.focus();
      return;
    }

    try {
      // Cascade panels slightly so multiple HUDs don't stack exactly on top of each other
      const offset = (this.panels.size % 5) * 30;

      // Create new floating frameless HUD window (760x580 parity with reference app)
      const win = new BrowserWindow({
        width: 760,
        height: 580,
        x: 120 + offset,
        y: 90 + offset,
        minWidth: 400,
        minHeight: 300,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        title: payload.title,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      // Handle close trigger from safe link click (#close)
      win.webContents.on('will-navigate', (event, targetUrl) => {
        event.preventDefault();
        if (targetUrl.endsWith('#close')) {
          win.close();
        } else if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
          shell.openExternal(targetUrl);
        }
      });

      // Deny popup windows
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          shell.openExternal(url);
        }
        return { action: 'deny' };
      });

      // Track instance
      this.panels.set(payload.panelId, { window: win, payload });

      win.on('closed', () => {
        this.panels.delete(payload.panelId);
      });

      const html = generatePanelHtml(payload);
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      win.show();
    } catch (err) {
      console.warn('[InfoPanelWindowManager] Window creation in environment:', err);
      this.panels.set(payload.panelId, { window: null, payload });
    }
  }

  public closePanel(panelId?: string): boolean {
    if (!panelId || panelId === 'all') {
      this.closeAllPanels();
      return true;
    }

    if (panelId === 'visual_hub') {
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('restore-visual-hub');
      }
      return true;
    }

    if (panelId === 'media-player') {
      closeAllVideoWindows();
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('close-media-player');
      }
      return true;
    }

    const entry = this.panels.get(panelId);
    if (entry) {
      if (entry.window && !entry.window.isDestroyed()) {
        entry.window.close();
      }
      this.panels.delete(panelId);
      return true;
    }
    return false;
  }

  public getPanelData(panelId: string): InfoPanelPayload | undefined {
    return this.panels.get(panelId)?.payload;
  }

  public getAllPanels(): InfoPanelPayload[] {
    return Array.from(this.panels.values()).map((p) => p.payload);
  }

  public closeAllPanels(): void {
    for (const [id, entry] of this.panels.entries()) {
      if (entry.window && !entry.window.isDestroyed()) {
        entry.window.close();
      }
    }
    this.panels.clear();
  }
}

export const infoPanelWindowManager = new InfoPanelWindowManager();
