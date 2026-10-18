import https from 'node:https';
import type { RequestDetails } from 'web-push';
import { AppDeliveryError } from './appErrors.js';

/** Encryption/VAPID come from web-push; this owner bounds and drains the transport. */
export async function sendPushRequest(details: RequestDetails, signal: AbortSignal, deadlineMs = 15_000): Promise<void> {
  if (signal.aborted) throw new AppDeliveryError('Push cancelled before delivery', false);
  const endpoint = new URL(details.endpoint);
  if (endpoint.protocol !== 'https:') throw new AppDeliveryError('Invalid push transport protocol', false);
  await new Promise<void>((resolve, reject) => {
    let failure: AppDeliveryError | undefined;
    let acknowledged = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: ReturnType<typeof https.request>;
    const uncertain = () => { failure ??= new AppDeliveryError('Push delivery outcome is unknown', true); request.destroy(); };
    try {
      request = https.request(endpoint, { method: details.method, headers: details.headers, agent: false }, response => {
        let bytes = 0;
        response.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 64 * 1024) uncertain(); });
        response.on('error', uncertain);
        response.on('aborted', uncertain);
        response.on('end', () => {
          if (failure) return;
          const code = response.statusCode ?? 0;
          if (code >= 200 && code < 300) acknowledged = true;
          else failure = Object.assign(new AppDeliveryError('Push provider delivery failed', !(code >= 400 && code < 500)), { statusCode: code });
          request.destroy();
        });
      });
    } catch { reject(new AppDeliveryError('Push request could not be initialized', false)); return; }
    request.on('error', () => { failure ??= new AppDeliveryError('Push delivery outcome is unknown', true); });
    // Settlement follows owned transport close, including deadline/cancellation destruction.
    request.once('close', () => {
      clearTimeout(timer); signal.removeEventListener('abort', uncertain);
      if (failure) reject(failure);
      else if (acknowledged) resolve();
      else reject(new AppDeliveryError('Push closed without acknowledgement', true));
    });
    signal.addEventListener('abort', uncertain, { once: true });
    timer = setTimeout(uncertain, deadlineMs);
    if (signal.aborted) { uncertain(); return; }
    request.end(details.body);
  });
}
