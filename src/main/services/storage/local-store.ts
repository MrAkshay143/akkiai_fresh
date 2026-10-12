import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export class LocalStore<T> {
  private filePath: string;
  private data: T;

  constructor(filename: string, defaultData: T) {
    const userData = app.getPath('userData');
    const rootPath = path.join(userData, filename);
    const subDirPath = path.join(userData, 'data', filename);

    // If file exists in userData/data/ but not in root userData, migrate to root
    if (!fs.existsSync(rootPath) && fs.existsSync(subDirPath)) {
      try {
        fs.copyFileSync(subDirPath, rootPath);
      } catch (e) {
        console.warn(`[LocalStore] Failed to migrate ${subDirPath} to ${rootPath}:`, e);
      }
    }

    this.filePath = rootPath;
    this.data = this.readData(defaultData);
  }

  private readData(defaultData: T): T {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn(`[LocalStore] Failed to read ${this.filePath}, using defaults:`, err);
    }
    this.writeData(defaultData);
    return defaultData;
  }

  private writeData(data: T): void {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[LocalStore] Failed to write ${this.filePath}:`, err);
    }
  }

  public get(): T {
    return this.data;
  }

  public set(newData: T): void {
    this.data = newData;
    this.writeData(newData);
  }

  public update(updater: (current: T) => T): T {
    this.data = updater(this.data);
    this.writeData(this.data);
    return this.data;
  }
}
