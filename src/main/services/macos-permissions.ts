/**
 * macOS Permissions Bootstrap (ported from reference electron/services/macos-permissions.js)
 */

import { systemPreferences } from 'electron';
import { isMac } from './platform-utils';

const PREFIX = '[macOS Permissions]';

export async function bootstrapMacPermissions(): Promise<void> {
  if (!isMac) return;

  // 1. Microphone
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log(`${PREFIX} Microphone: ${micStatus}`);
    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log(`${PREFIX} Microphone prompt result: ${granted ? 'granted' : 'denied'}`);
    }
  } catch (err: any) {
    console.warn(`${PREFIX} Microphone check failed: ${err.message}`);
  }

  // 2. Accessibility (mouse/keyboard control + window titles)
  try {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    console.log(`${PREFIX} Accessibility trusted: ${trusted}`);
    if (!trusted) {
      console.warn(
        `${PREFIX} Desktop automation (mouse/keyboard/window control) needs Accessibility permission. macOS has shown the dialog — enable the app in System Settings.`
      );
    }
  } catch (err: any) {
    console.warn(`${PREFIX} Accessibility check failed: ${err.message}`);
  }

  // 3. Screen Recording (screenshots)
  try {
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log(`${PREFIX} Screen Recording: ${screenStatus}`);
    if (screenStatus !== 'granted') {
      console.warn(`${PREFIX} Desktop screenshots will trigger a Screen Recording permission prompt on first use.`);
    }
  } catch (err: any) {
    console.warn(`${PREFIX} Screen Recording check failed: ${err.message}`);
  }
}
