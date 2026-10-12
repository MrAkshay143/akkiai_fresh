import { app, App } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const DEFAULT_SOUL_CONTENT = `You are a Loyal Butler — a composed, distinguished male assistant. Formal, respectful, always at service. Speak with precision, quiet confidence, and a touch of class. Use "Sir" where appropriate. Your tone is deep, steady, and reassuring. You are the ultimate personal aide — calm under pressure, never flustered, always one step ahead.

CULTURAL GREETINGS: Greet naturally with "Namaste" or "Namaskar". Occasionally and organically, vary your greeting with warm traditional expressions like "Hare Krishna", "Radhe Radhe", or "Jai Shiva Shambhu" in a spontaneous, respectful manner.
`;

export const DEFAULT_MEMORY_CONTENT = `# AKKI AI — Long-term Durable Memory

- [System] Akki Memory System Initialized.
- [Greetings] Authentic Cultural Greetings: Namaste, Hare Krishna, Radhe Radhe.
`;

export function getAkkiBootstrapDir(appInstance?: App): string {
  try {
    const documentsPath = appInstance?.getPath
      ? appInstance.getPath('documents')
      : app?.getPath
      ? app.getPath('documents')
      : path.join(os.homedir(), 'Documents');
    return path.join(documentsPath, 'Akki Data', '.akki');
  } catch (_) {
    return path.join(os.homedir(), 'Documents', 'Akki Data', '.akki');
  }
}

export function getAkkiMemoryDir(appInstance?: App): string {
  return path.join(getAkkiBootstrapDir(appInstance), 'memory');
}

export function getHermesDir(): string {
  return path.join(os.homedir(), '.hermes');
}

export function getHermesMemoriesDir(): string {
  return path.join(getHermesDir(), 'memories');
}

/**
 * Ensures all Akki and Hermes storage directories exist and are seeded
 * with default MEMORY.md and SOUL.md containing cultural greetings.
 */
export function ensureAkkiDirectories(appInstance?: App): string | null {
  try {
    const documentsPath = appInstance?.getPath
      ? appInstance.getPath('documents')
      : app?.getPath
      ? app.getPath('documents')
      : path.join(os.homedir(), 'Documents');

    const notesPath = path.join(documentsPath, 'Akki Data');

    // Create Akki Data directory
    if (!fs.existsSync(notesPath)) {
      fs.mkdirSync(notesPath, { recursive: true });
      console.log('[Bootstrap] Created Akki Data directory:', notesPath);
    }

    // 1. Akki Data .akki directories
    const akkiDir = getAkkiBootstrapDir(appInstance);
    const akkiMemoryDir = getAkkiMemoryDir(appInstance);

    if (!fs.existsSync(akkiDir)) fs.mkdirSync(akkiDir, { recursive: true });
    if (!fs.existsSync(akkiMemoryDir)) fs.mkdirSync(akkiMemoryDir, { recursive: true });

    // Seed Akki MEMORY.md and SOUL.md
    const akkiMemoryMdPath = path.join(akkiDir, 'MEMORY.md');
    if (!fs.existsSync(akkiMemoryMdPath)) {
      fs.writeFileSync(akkiMemoryMdPath, DEFAULT_MEMORY_CONTENT, 'utf8');
      console.log('[Bootstrap] Created default Akki MEMORY.md');
    }

    const akkiSubMemoryMdPath = path.join(akkiMemoryDir, 'MEMORY.md');
    if (!fs.existsSync(akkiSubMemoryMdPath)) {
      fs.writeFileSync(akkiSubMemoryMdPath, DEFAULT_MEMORY_CONTENT, 'utf8');
      console.log('[Bootstrap] Created default Akki memory/MEMORY.md');
    }

    const akkiSoulPath = path.join(akkiDir, 'SOUL.md');
    if (!fs.existsSync(akkiSoulPath)) {
      fs.writeFileSync(akkiSoulPath, DEFAULT_SOUL_CONTENT, 'utf8');
      console.log('[Bootstrap] Created default Akki SOUL.md');
    }

    // 2. Hermes directories (.hermes and .hermes/memories)
    const hermesDir = getHermesDir();
    const hermesMemoriesDir = getHermesMemoriesDir();

    if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
    if (!fs.existsSync(hermesMemoriesDir)) fs.mkdirSync(hermesMemoriesDir, { recursive: true });

    const hermesSoulPath = path.join(hermesDir, 'SOUL.md');
    if (!fs.existsSync(hermesSoulPath)) {
      fs.writeFileSync(hermesSoulPath, DEFAULT_SOUL_CONTENT, 'utf8');
      console.log('[Bootstrap] Created default .hermes/SOUL.md');
    }

    const hermesMemoryPath = path.join(hermesMemoriesDir, 'MEMORY.md');
    if (!fs.existsSync(hermesMemoryPath)) {
      fs.writeFileSync(hermesMemoryPath, DEFAULT_MEMORY_CONTENT, 'utf8');
      console.log('[Bootstrap] Created default .hermes/memories/MEMORY.md');
    }

    console.log('[Bootstrap] .akki/ and .hermes/ directories ready.');
    return notesPath;
  } catch (error) {
    console.error('[Bootstrap] Failed to create Akki/Hermes directories:', error);
    return null;
  }
}
