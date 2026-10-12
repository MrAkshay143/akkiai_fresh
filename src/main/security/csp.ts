import { session } from 'electron';

export function configureCsp(): void {
  // Legacy exact CSP matching test_unpack/electron/main_source.js
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
          "connect-src * ws: wss: data: blob:; " +
          "media-src * data: blob:; " +
          "frame-src *; " +
          "img-src * data: blob:; " +
          "script-src * 'unsafe-inline' 'unsafe-eval'; " +
          "style-src * 'unsafe-inline'; " +
          "font-src * data:;",
        ],
      },
    });
  });

  // PRODUCTION: Remove CSP completely for local file protocol (matching legacy)
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['file://*'] },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['Content-Security-Policy'];
      delete responseHeaders['content-security-policy'];
      callback({ responseHeaders });
    }
  );
}
