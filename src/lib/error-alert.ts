/**
 * Pemantauan galat tanpa dependency (ADR-061): `instrumentation.ts`
 * menulis satu baris JSON per galat (terbaca log hosting mana pun) dan, bila
 * `ERROR_ALERT_WEBHOOK_URL` diisi, mengirim ringkasan ke webhook Slack/Discord.
 * Modul ini murni supaya aturan pemangkasan & pembatasnya bisa diuji.
 */

export interface RequestErrorEntry {
  readonly event: 'request_error';
  readonly at: string;
  readonly digest: string | null;
  readonly message: string;
  readonly method: string;
  /** Tanpa query string: `?code=`, `?token_hash=`, dan email bisa ada di sana. */
  readonly path: string;
  readonly routePath: string;
  readonly routeType: string;
}

const MESSAGE_MAX = 300;

export function toRequestErrorEntry(
  error: unknown,
  request: { readonly path: string; readonly method: string },
  context: { readonly routePath: string; readonly routeType: string },
  now: Date = new Date(),
): RequestErrorEntry {
  const err = error as { message?: unknown; digest?: unknown } | null;
  const message = typeof err?.message === 'string' ? err.message : String(error);
  return {
    event: 'request_error',
    at: now.toISOString(),
    digest: typeof err?.digest === 'string' ? err.digest : null,
    message: message.replace(/\s+/g, ' ').slice(0, MESSAGE_MAX),
    method: request.method,
    path: request.path.split('?')[0]!.slice(0, 200),
    routePath: context.routePath,
    routeType: context.routeType,
  };
}

/**
 * Pembatas kiriman webhook per proses: galat yang sama (rute + pesan) paling
 * sering sekali per `windowMs`, dan total paling banyak `maxPerWindow` — satu
 * database mati tidak boleh berubah jadi ratusan pesan per menit.
 */
export class AlertThrottle {
  private readonly lastByKey = new Map<string, number>();
  private sent: number[] = [];

  constructor(
    private readonly windowMs = 5 * 60_000,
    private readonly maxPerWindow = 10,
  ) {}

  shouldSend(entry: RequestErrorEntry, now = Date.now()): boolean {
    const key = `${entry.routePath}|${entry.message}`;
    const last = this.lastByKey.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    this.sent = this.sent.filter((at) => now - at < this.windowMs);
    if (this.sent.length >= this.maxPerWindow) return false;
    this.lastByKey.set(key, now);
    this.sent.push(now);
    if (this.lastByKey.size > 500) this.lastByKey.delete(this.lastByKey.keys().next().value!);
    return true;
  }
}

/** Badan webhook yang diterima Slack (`text`) maupun Discord (`content`). */
export function alertBody(entry: RequestErrorEntry, site: string): { text: string; content: string } {
  const text = `⚠️ StudentFo (${site}) galat di ${entry.method} ${entry.path} [${entry.routeType}]: ${entry.message}${entry.digest ? ` (digest ${entry.digest})` : ''}`;
  return { text, content: text.slice(0, 1900) };
}
