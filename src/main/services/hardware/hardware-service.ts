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

import { FirmataClient, UNO_SPEC, MODES } from './firmata-client';

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

  public getBoardInfo() {
    if (!this.isConnected() || !this.client) return null;
    return {
      port: this.connectedPort,
      firmware: `${this.client.firmware?.name || 'StandardFirmata'} v${this.client.firmware?.major || 0}.${this.client.firmware?.minor || 0}`,
      totalPins: UNO_SPEC.totalPins,
      digitalPinCount: UNO_SPEC.digitalPinCount,
      analogPins: UNO_SPEC.analogPins,
      pwmPins: UNO_SPEC.pwmPins,
      builtinLED: UNO_SPEC.builtinLED,
    };
  }

  public getBoardStatus(): { success: boolean; info?: any; error?: string } {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.' };
    }
    return { success: true, info: this.getBoardInfo() };
  }

  public async connect(port: string): Promise<{ success: boolean; info?: any; alreadyConnected?: boolean; port?: string; error?: string }> {
    if (!port || typeof port !== 'string' || !port.trim()) {
      return { success: false, error: 'port argument required (e.g. "COM3").' };
    }
    if (this.isConnected()) {
      if (this.connectedPort === port) {
        return { success: true, alreadyConnected: true, info: this.getBoardInfo() };
      }
      this.disconnect();
    }
    return new Promise((resolve) => {
      try {
        this.client = new FirmataClient();
        this.client.connect(port).then(() => {
          this.connectedPort = port;
          this.isReady = true;
          resolve({ success: true, port, info: this.getBoardInfo() });
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
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.', pin, value: val };
    }
    try {
      this.client.pinMode(pin, MODES.OUTPUT);
      const out = val ? 1 : 0;
      this.client.digitalWrite(pin, out);
      return { success: true, pin, value: out };
    } catch (err: any) {
      return { success: false, error: err?.message || 'digitalWrite failed', pin, value: val };
    }
  }

  public async digitalRead(pin: number): Promise<{ success: boolean; pin: number; value?: number; error?: string }> {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.', pin };
    }
    return new Promise((resolve) => {
      let done = false;
      try {
        this.client.pinMode(pin, MODES.INPUT);
        this.client.digitalRead(pin, (v: number) => {
          if (done) return;
          done = true;
          resolve({ success: true, pin, value: v });
        });
        setTimeout(() => {
          if (!done) {
            done = true;
            resolve({ success: false, error: `Digital read pin ${pin} timed out.`, pin });
          }
        }, 3000);
      } catch (err: any) {
        resolve({ success: false, error: err?.message || 'digitalRead failed', pin });
      }
    });
  }

  public async analogWrite(pin: number, value: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.', pin, value };
    }
    try {
      this.client.pinMode(pin, MODES.PWM);
      const v = Math.max(0, Math.min(255, Math.round(Number(value))));
      this.client.analogWrite(pin, v);
      return { success: true, pin, value: v, percentage: Math.round((v / 255) * 100) };
    } catch (err: any) {
      return { success: false, error: err?.message || 'analogWrite failed', pin, value };
    }
  }

  public async analogRead(pin: number): Promise<{ success: boolean; analogPin?: string; value?: number; voltage?: string; error?: string }> {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.' };
    }
    return new Promise((resolve) => {
      let done = false;
      try {
        this.client.analogRead(pin, (v: number) => {
          if (done) return;
          done = true;
          const voltage = ((v / 1023) * 5).toFixed(3);
          resolve({ success: true, analogPin: `A${pin}`, value: v, voltage });
        });
        setTimeout(() => {
          if (!done) {
            done = true;
            resolve({ success: false, error: `Analog read A${pin} timed out.` });
          }
        }, 3000);
      } catch (err: any) {
        resolve({ success: false, error: err?.message || 'analogRead failed' });
      }
    });
  }

  public async setPinMode(pin: number, mode: string | number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.' };
    }
    try {
      if (typeof mode === 'number') {
        this.client.pinMode(pin, mode);
        return { success: true, pin, mode };
      }
      const modeMap: Record<string, number> = {
        INPUT: MODES.INPUT,
        OUTPUT: MODES.OUTPUT,
        INPUT_PULLUP: MODES.PULLUP,
        PWM: MODES.PWM,
        SERVO: MODES.SERVO,
        ANALOG: MODES.ANALOG,
      };
      const firmataMode = modeMap[String(mode).toUpperCase()];
      if (firmataMode === undefined) {
        return { success: false, error: `Unknown mode "${mode}". Valid: INPUT, OUTPUT, INPUT_PULLUP, PWM, SERVO, ANALOG` };
      }
      this.client.pinMode(pin, firmataMode);
      return { success: true, pin, mode };
    } catch (err: any) {
      return { success: false, error: err?.message || 'pinMode failed' };
    }
  }

  public async servoWrite(pin: number, angle: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.', pin, angle };
    }
    try {
      const a = Math.max(0, Math.min(180, Math.round(Number(angle))));
      this.client.servoWrite(pin, a);
      return { success: true, pin, angle: a };
    } catch (err: any) {
      return { success: false, error: err?.message || 'servoWrite failed', pin, angle };
    }
  }

  public async ledBlink(pin: number, intervalMs?: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.' };
    }
    try {
      const interval = Math.max(50, Number(intervalMs) || 500);
      this.client.ledBlink(pin, interval);
      return { success: true, pin, intervalMs: interval };
    } catch (err: any) {
      return { success: false, error: err?.message || 'ledBlink failed' };
    }
  }

  public async ledStop(pin: number) {
    if (!this.client || !this.isReady) {
      return { success: false, error: 'Arduino not connected. Call arduino_connect first.' };
    }
    try {
      this.client.ledStop(pin);
      return { success: true, pin };
    } catch (err: any) {
      return { success: false, error: err?.message || 'ledStop failed' };
    }
  }

  public disconnect(): { success: boolean; message: string } {
    if (!this.connectedPort) {
      return { success: true, message: 'Already disconnected.' };
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
