import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { app } from 'electron';

export interface LicenseState {
  status: 'none' | 'pending' | 'approved' | 'blocked';
  plan?: string;
  email?: string;
  uid?: string;
  hardwareId?: string;
  createdAt?: number;
  expiresAt?: number | null;
  approvedAt?: number | null;
  blockedAt?: number | null;
  licenseType?: string;
  certifiedAccountEmail?: string | null;
  certifiedAccountUid?: string | null;
  certifiedAt?: number | null;
}

export function getLicensePath(): string {
  return path.join(app.getPath('userData'), 'license.json');
}

/**
 * Generates a unique fingerprint tied to the physical machine.
 * Uses CPU + memory + username + platform to create a consistent ID.
 */
export function generateHardwareId(): string {
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown',
    String(os.totalmem()),
    os.userInfo()?.username || 'unknown',
  ];
  const raw = components.join('||');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function getLicenseState(): LicenseState | null {
  try {
    const p = getLicensePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function saveLicenseState(data: LicenseState): boolean {
  try {
    fs.writeFileSync(getLicensePath(), JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function clearLicense(): boolean {
  try {
    const p = getLicensePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isLicenseApproved(): boolean {
  const state = getLicenseState();
  return !!(state && state.status === 'approved');
}

export function getLicenseStatus(): {
  status: string;
  plan?: string;
  email?: string;
  hardwareId?: string;
  message: string;
} {
  const state = getLicenseState();
  if (!state) {
    return { status: 'none', message: 'No license found' };
  }
  return {
    status: state.status,
    plan: state.plan,
    email: state.email,
    hardwareId: state.hardwareId,
    message: state.status === 'approved' ? 'License approved' : 'Waiting for approval',
  };
}

export function savePendingLicense({
  uid,
  email,
  plan,
  hardwareId,
}: {
  uid?: string;
  email?: string;
  plan?: string;
  hardwareId?: string;
}): boolean {
  const state: LicenseState = {
    status: 'pending',
    plan,
    email,
    uid,
    hardwareId: hardwareId || generateHardwareId(),
    createdAt: Date.now(),
    expiresAt: null,
    approvedAt: null,
  };
  return saveLicenseState(state);
}

export function approveLicense(data: Partial<LicenseState>): boolean {
  const current = getLicenseState() || { status: 'approved' as const };
  const state: LicenseState = {
    ...current,
    ...data,
    status: 'approved',
    approvedAt: Date.now(),
  };
  return saveLicenseState(state);
}

export function isHardwareMatch(): boolean {
  const state = getLicenseState();
  if (!state || !state.hardwareId) return false;
  return state.hardwareId === generateHardwareId();
}

export function blockLicense(data: Partial<LicenseState>): boolean {
  const current = getLicenseState() || { status: 'blocked' as const };
  const state: LicenseState = {
    ...current,
    ...data,
    status: 'blocked',
    blockedAt: Date.now(),
  };
  return saveLicenseState(state);
}

export function isLicenseBlocked(): boolean {
  const state = getLicenseState();
  return !!(state && state.status === 'blocked');
}

export function markCertified({
  plan,
  email,
  uid,
  expiresAt,
}: {
  plan?: string;
  email?: string;
  uid?: string;
  expiresAt?: number | null;
}): boolean {
  const current = getLicenseState() || { status: 'approved' as const };
  const state: LicenseState = {
    ...current,
    status: 'approved',
    licenseType: 'certification',
    certifiedAccountEmail: email || current.email || null,
    certifiedAccountUid: uid || current.uid || null,
    plan: plan || current.plan || 'certification',
    certifiedAt: Date.now(),
    expiresAt: expiresAt || null,
    hardwareId: current.hardwareId || undefined,
  };
  return saveLicenseState(state);
}

export function isCertificationLicense(): boolean {
  const state = getLicenseState();
  if (!state) return false;
  return state.licenseType === 'certification' && state.status === 'approved';
}

export function isEffectiveLicensed(): boolean {
  const state = getLicenseState();
  if (!state) return false;
  if (state.status !== 'approved') return false;
  if (state.licenseType === 'certification') return true;
  return isHardwareMatch();
}

/**
 * Register device with remote Hostinger MySQL backend API (https://imakshay.in/akkiai/api/register.php)
 */
export async function registerDeviceWithBackend(user: {
  email: string;
  name?: string;
  photo_url?: string;
}): Promise<{ success: boolean; status: 'approved' | 'pending' | 'blocked'; plan?: string }> {
  const hwid = generateHardwareId();
  try {
    const res = await fetch('https://imakshay.in/akkiai/api/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        name: user.name || user.email,
        photo_url: user.photo_url || '',
        hwid: hwid,
        device_name: os.hostname(),
        os: process.platform,
        app_version: app.getVersion() || '2.1.0',
      }),
    });
    const data = await res.json();
    const status = data?.status === 'approved' ? 'approved' : data?.status === 'blocked' ? 'blocked' : 'pending';
    if (status === 'approved') {
      approveLicense({
        plan: data?.plan || 'pro',
        hardwareId: hwid,
        email: user.email,
      });
    } else if (status === 'blocked') {
      blockLicense({
        hardwareId: hwid,
        email: user.email,
      });
    } else {
      savePendingLicense({
        email: user.email,
        hardwareId: hwid,
        plan: data?.plan || 'pro',
      });
    }
    return { success: true, status, plan: data?.plan || 'pro' };
  } catch (err: any) {
    console.warn('[LicenseManager] Hostinger register warning:', err.message);
    const current = getLicenseState();
    if (current && current.status === 'approved') {
      return { success: true, status: 'approved', plan: current.plan || 'pro' };
    }
    return { success: false, status: 'pending', plan: 'pro' };
  }
}

/**
 * Checks approval status against remote Hostinger backend API (https://imakshay.in/akkiai/api/check_status.php)
 */
export async function checkRemoteLicenseStatus(
  email?: string,
  hardwareId?: string
): Promise<{ success: boolean; status: 'approved' | 'pending' | 'blocked' | 'not_found' | 'error' | 'none' }> {
  const lic = getLicenseState();
  const userEmail = email || lic?.email;
  const hwid = hardwareId || lic?.hardwareId || generateHardwareId();

  if (!userEmail) {
    return { success: false, status: 'error' };
  }

  try {
    const url = `https://imakshay.in/akkiai/api/check_status.php?email=${encodeURIComponent(userEmail)}&hwid=${encodeURIComponent(hwid)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.status === 'approved') {
      approveLicense({
        plan: 'pro',
        hardwareId: hwid,
        email: userEmail,
      });
      return { success: true, status: 'approved' };
    } else if (data && data.status === 'blocked') {
      blockLicense({
        hardwareId: hwid,
        email: userEmail,
      });
      return { success: true, status: 'blocked' };
    } else if (data && data.status === 'pending') {
      savePendingLicense({
        email: userEmail,
        hardwareId: hwid,
        plan: 'pro',
      });
      return { success: true, status: 'pending' };
    }
    return { success: false, status: data?.status || 'not_found' };
  } catch (err: any) {
    console.warn('[LicenseManager] Hostinger check_status error:', err.message);
    if (lic && lic.status === 'approved' && isHardwareMatch()) {
      return { success: true, status: 'approved' };
    }
    return { success: false, status: (lic?.status as any) || 'pending' };
  }
}

/**
 * Keep-alive heartbeat to update online status & detect admin revocations (https://imakshay.in/akkiai/api/heartbeat.php)
 */
export async function sendHeartbeat(
  email?: string,
  hardwareId?: string
): Promise<{ success: boolean; status: string }> {
  const lic = getLicenseState();
  const userEmail = email || lic?.email;
  const hwid = hardwareId || lic?.hardwareId || generateHardwareId();

  if (!userEmail) return { success: false, status: 'unknown' };

  try {
    const url = `https://imakshay.in/akkiai/api/heartbeat.php?email=${encodeURIComponent(userEmail)}&hwid=${encodeURIComponent(hwid)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.status === 'blocked') {
      blockLicense({ hardwareId: hwid, email: userEmail });
      return { success: true, status: 'blocked' };
    }
    return { success: true, status: data?.status || 'approved' };
  } catch (err: any) {
    return { success: false, status: lic?.status || 'unknown' };
  }
}

let licenseWatchInterval: NodeJS.Timeout | null = null;
let licenseMonitorInterval: NodeJS.Timeout | null = null;

export function startLicenseApprovalWatch(
  hardwareId: string,
  email?: string,
  onStatusChange?: (status: 'approved' | 'blocked') => void
): void {
  stopLicenseApprovalWatch();

  const userEmail = email || getLicenseState()?.email || '';

  const poll = async () => {
    try {
      const res = await checkRemoteLicenseStatus(userEmail, hardwareId);
      if (res.status === 'approved' || res.status === 'blocked') {
        stopLicenseApprovalWatch();
        if (onStatusChange) onStatusChange(res.status);
        if (res.status === 'approved') {
          startLicenseMonitor(hardwareId, userEmail);
        }
      }
    } catch {}
  };

  poll();
  licenseWatchInterval = setInterval(poll, 3000);
}

export function stopLicenseApprovalWatch(): void {
  if (licenseWatchInterval) {
    clearInterval(licenseWatchInterval);
    licenseWatchInterval = null;
  }
}

export function startLicenseMonitor(
  hardwareId: string,
  email?: string,
  onBlocked?: () => void
): void {
  stopLicenseMonitor();

  const userEmail = email || getLicenseState()?.email || '';

  const check = async () => {
    try {
      const res = await sendHeartbeat(userEmail, hardwareId);
      if (res.status === 'blocked') {
        stopLicenseMonitor();
        if (onBlocked) onBlocked();
      }
    } catch {}
  };

  licenseMonitorInterval = setInterval(check, 60000);
}

export function stopLicenseMonitor(): void {
  if (licenseMonitorInterval) {
    clearInterval(licenseMonitorInterval);
    licenseMonitorInterval = null;
  }
}

