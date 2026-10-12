/**
 * Hardware Service for Arduino & Serial Devices
 * Interacts with physical microcontrollers using serialport / Windows PowerShell enumeration
 * and Firmata protocol.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

import { FirmataClient } from './firmata-client';

export class HardwareService {
  private connectedPort: string | null = null;
  private isReady = false;
  private client: any = null;

  constructor() {}

  /**
   * Scans system for available serial / COM ports.
   * Uses serialport if available, otherwise queries Windows native ports.
   */
  public async listPorts(): Promise<{
    success: boolean;
    ports: SerialPortInfo[];
    diagnostics: { serialportModule: boolean; method: string };
    error?: string;
  }> {
    // 1. Try native serialport package if installed
    try {
      const serialportMod = require('serialport');
      const SerialPort = serialportMod.SerialPort || serialportMod;
      if (SerialPort && typeof SerialPort.list === 'function') {
        const ports = await SerialPort.list();
        return {
          success: true,
          ports: ports.map((p: any) => ({
            path: p.path,
            manufacturer: p.manufacturer || 'Unknown',
            serialNumber: p.serialNumber || null,
            vendorId: p.vendorId || null,
            productId: p.productId || null,
          })),
          diagnostics: { serialportModule: true, method: 'serialport.list' },
        };
      }
    } catch (_) {
      // Fallback to Windows PowerShell query
    }

    // 2. Query Windows PowerShell serial ports
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"`
      );
      const lines = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && /^COM\d+$/i.test(s));

      const portList: SerialPortInfo[] = lines.map((port) => ({
        path: port.toUpperCase(),
        manufacturer: 'Serial Device (Windows)',
      }));

      return {
        success: true,
        ports: portList,
        diagnostics: { serialportModule: false, method: 'powershell-ports' },
      };
    } catch (err: any) {
      return {
        success: false,
        ports: [],
        diagnostics: { serialportModule: false, method: 'none' },
        error: `Port enumeration failed: ${err.message}`,
      };
    }
  }

  public async connect(port: string) {
    if (!port || typeof port !== 'string' || !port.trim()) {
      return { success: false, error: 'Port parameter is required' };
    }
    if (this.isConnected()) {
      if (this.connectedPort === port) return { success: true, port, message: 'Already connected' };
      this.disconnect();
    }
    return new Promise((resolve) => {
      try {
        this.client = new FirmataClient();
        this.client.connect(port).then(() => {
          this.connectedPort = port;
          this.isReady = true;
          resolve({ success: true, port, boardInfo: this.client.firmware });
        }).catch((err: any) => {
          this.isReady = false;
          this.connectedPort = null;
          resolve({ success: false, error: err?.message || 'Connection failed' });
        });
      } catch (err: any) {
        this.isReady = false;
        this.connectedPort = null;
        resolve({ success: false, error: err?.message || 'Connection failed' });
      }
    });
  }

  public async digitalWrite(pin: number, val: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Hardware not connected', pin, value: val };
    }
    try {
      this.client.digitalWrite(pin, val);
      return { success: true, pin, value: val };
    } catch (err: any) {
      return { success: false, error: err?.message || 'digitalWrite failed', pin, value: val };
    }
  }

  public async analogRead(pin: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Hardware not connected', pin, value: 0 };
    }
    return new Promise((resolve) => {
      try {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'analogRead timeout', pin, value: 0 });
        }, 3000);
        this.client.analogRead(pin, (val: number) => {
          clearTimeout(timeout);
          resolve({ success: true, pin, value: val });
        });
      } catch (err: any) {
        resolve({ success: false, error: err?.message || 'analogRead failed', pin, value: 0 });
      }
    });
  }

  public async servoWrite(pin: number, angle: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Hardware not connected', pin, angle };
    }
    try {
      this.client.servoWrite(pin, angle);
      return { success: true, pin, angle };
    } catch (err: any) {
      return { success: false, error: err?.message || 'servoWrite failed', pin, angle };
    }
  }

  public async pinMode(pin: number, mode: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Hardware not connected', pin, mode };
    }
    try {
      this.client.pinMode(pin, mode);
      return { success: true, pin, mode };
    } catch (err: any) {
      return { success: false, error: err?.message || 'pinMode failed', pin, mode };
    }
  }

  public disconnect(): { success: boolean; message: string } {
    if (!this.connectedPort) {
      return { success: true, message: 'No active board connection.' };
    }
    if (this.client) {
      this.client.close();
    }
    const old = this.connectedPort;
    this.connectedPort = null;
    this.isReady = false;
    return { success: true, message: `Disconnected from ${old}.` };
  }

  public isConnected(): boolean {
    return this.isReady && !!this.connectedPort;
  }

  public getConnectedPort(): string | null {
    return this.connectedPort;
  }
}

export const hardwareService = new HardwareService();
