import type { Instrumentation } from 'next';
import { AlertThrottle, alertBody, toRequestErrorEntry } from '@/lib/error-alert';
import { env, siteUrl } from '@/lib/env';

const throttle = new AlertThrottle();

/**
 * Pemantauan galat server tanpa SDK pihak ketiga (ADR-061). Next memanggil ini
 * untuk galat render, Route Handler, Server Action, dan middleware. Tidak
 * pernah melempar: kegagalan melapor tidak boleh menambah galat baru.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const entry = toRequestErrorEntry(error, request, context);
    console.error(JSON.stringify(entry));
    if (!env.ERROR_ALERT_WEBHOOK_URL || !throttle.shouldSend(entry)) return;
    await fetch(env.ERROR_ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alertBody(entry, new URL(siteUrl).host)),
      signal: AbortSignal.timeout(3000),
    });
  } catch (reportError) {
    console.error('[pemantauan] gagal melaporkan galat:', reportError);
  }
};
