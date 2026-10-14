import fs from 'fs';
import path from 'path';
import {
  ensureAkkiDirectories,
  getHermesDir,
  getHermesMemoriesDir,
  getAkkiBootstrapDir,
  getAkkiMemoryDir,
  DEFAULT_SOUL_CONTENT,
  DEFAULT_MEMORY_CONTENT,
} from '../storage/paths';

export class MemoryService {
  private hermesDir: string;
  private hermesMemoriesDir: string;
  private hermesMemoryFilePath: string;
  private hermesSoulFilePath: string;

  private akkiBootstrapDir: string;
  private akkiMemoryDir: string;
  private akkiMemoryFilePath: string;
  private akkiLegacyMemoryFilePath: string;
  private akkiSoulFilePath: string;

  constructor() {
    this.hermesDir = getHermesDir();
    this.hermesMemoriesDir = getHermesMemoriesDir();
    this.hermesMemoryFilePath = path.join(this.hermesMemoriesDir, 'MEMORY.md');
    this.hermesSoulFilePath = path.join(this.hermesDir, 'SOUL.md');

    this.akkiBootstrapDir = getAkkiBootstrapDir();
    this.akkiMemoryDir = getAkkiMemoryDir();
    this.akkiMemoryFilePath = path.join(this.akkiMemoryDir, 'MEMORY.md');
    this.akkiLegacyMemoryFilePath = path.join(this.akkiBootstrapDir, 'MEMORY.md');
    this.akkiSoulFilePath = path.join(this.akkiBootstrapDir, 'SOUL.md');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    try {
      ensureAkkiDirectories();
    } catch (err) {
      console.error('[MemoryService] Directory initialization error:', err);
    }
  }

  private safeWriteFile(filePath: string, content: string): boolean {
    try {
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const tempPath = `${filePath}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, filePath);
      return true;
    } catch (err) {
      console.error(`[MemoryService] Failed to safely write ${filePath}:`, err);
      // Fallback direct write
      try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
      } catch (directErr) {
        console.error(`[MemoryService] Direct write also failed for ${filePath}:`, directErr);
        return false;
      }
    }
  }

  private safeAppendFile(filePath: string, content: string): boolean {
    try {
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.appendFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err) {
      console.error(`[MemoryService] Failed to append to ${filePath}:`, err);
      return false;
    }
  }

  public readRawMemory(): string {
    const candidates = [
      this.hermesMemoryFilePath,
      this.akkiMemoryFilePath,
      this.akkiLegacyMemoryFilePath,
    ];

    for (const filePath of candidates) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content && content.trim().length > 0) {
            return content;
          }
        }
      } catch (err) {
        console.warn(`[MemoryService] Failed reading candidate ${filePath}:`, err);
      }
    }

    return DEFAULT_MEMORY_CONTENT;
  }

  public appendMemoryFact(category: string, fact: string): boolean {
    try {
      this.ensureDirectories();
      const timestamp = new Date().toISOString().split('T')[0];
      const entry = `\n- [${timestamp}] [${category}] ${fact}`;

      const s1 = this.safeAppendFile(this.hermesMemoryFilePath, entry);
      const s2 = this.safeAppendFile(this.akkiMemoryFilePath, entry);
      this.safeAppendFile(this.akkiLegacyMemoryFilePath, entry);

      return s1 || s2;
    } catch (err) {
      console.error('[MemoryService] Failed to append fact:', err);
      return false;
    }
  }

  public writeRawMemory(content: string): boolean {
    try {
      this.ensureDirectories();
      const s1 = this.safeWriteFile(this.hermesMemoryFilePath, content);
      const s2 = this.safeWriteFile(this.akkiMemoryFilePath, content);
      this.safeWriteFile(this.akkiLegacyMemoryFilePath, content);

      return s1 || s2;
    } catch (err) {
      console.error('[MemoryService] Failed to write raw memory:', err);
      return false;
    }
  }

  public optimizeMemory(): { status: string; count: number } {
    try {
      const raw = this.readRawMemory();
      const lines = raw.split('\n');
      const uniqueLines = new Set<string>();
      const resultLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          resultLines.push(line);
        } else if (!uniqueLines.has(trimmed)) {
          uniqueLines.add(trimmed);
          resultLines.push(line);
        }
      }

      this.writeRawMemory(resultLines.join('\n'));
      return { status: 'Memory Optimizing... Completed', count: uniqueLines.size };
    } catch (err) {
      console.error('[MemoryService] Optimization failed:', err);
      return { status: 'Memory Optimization Failed', count: 0 };
    }
  }

  public readSoul(): string {
    const candidates = [
      this.hermesSoulFilePath,
      this.akkiSoulFilePath,
    ];

    for (const filePath of candidates) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content && content.trim().length > 0) {
            return content;
          }
        }
      } catch (err) {
        console.warn(`[MemoryService] Failed reading soul candidate ${filePath}:`, err);
      }
    }

    return DEFAULT_SOUL_CONTENT;
  }

  public writeSoul(content: string): boolean {
    try {
      this.ensureDirectories();
      const s1 = this.safeWriteFile(this.hermesSoulFilePath, content);
      const s2 = this.safeWriteFile(this.akkiSoulFilePath, content);
      return s1 || s2;
    } catch (err) {
      console.error('[MemoryService] Failed to write SOUL.md:', err);
      return false;
    }
  }

  public writeBootstrapFile(filename: string, content: string): boolean {
    try {
      const allowedFiles = ['MEMORY.md', 'SOUL.md', 'SKILLS.md'];
      if (!allowedFiles.includes(filename)) return false;

      let path1: string;
      let path2: string;
      if (filename === 'SOUL.md') {
        path1 = path.join(this.hermesDir, filename);
        path2 = this.akkiSoulFilePath;
      } else {
        path1 = path.join(this.hermesMemoriesDir, filename);
        path2 = path.join(this.akkiMemoryDir, filename);
      }

      const s1 = this.safeWriteFile(path1, content);
      const s2 = this.safeWriteFile(path2, content);

      return s1 || s2;
    } catch (err) {
      console.error('[MemoryService] writeBootstrapFile error:', err);
      return false;
    }
  }
}
