/**
 * Klik dari crawler, pratinjau tautan (WhatsApp/Telegram/Slack), dan alat
 * pemantau bukan niat pengguna. Kalau ikut tercatat, kegiatan yang sering
 * dibagikan di grup chat tampak "diminati" padahal hanya dipratinjau bot —
 * dan kalibrasi bobot ikut miring. Tanpa user-agent sama sekali = bukan browser.
 */
const NON_HUMAN_AGENT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|curl|wget|python-requests|httpclient|headless|lighthouse|pingdom|uptime/i;

export function isLikelyHumanAgent(userAgent: string | null): boolean {
  return Boolean(userAgent) && !NON_HUMAN_AGENT.test(userAgent!);
}

/**
 * Prefetch `<Link>` Next.js dan prefetch/prerender browser bukan kunjungan:
 * satu daftar berisi 12 kartu akan "mengunjungi" 12 acara tanpa ada yang
 * membukanya.
 */
export function isPrefetchRequest(headers: Pick<Headers, 'get'>): boolean {
  return (
    headers.get('next-router-prefetch') !== null ||
    /prefetch|prerender/i.test(headers.get('purpose') ?? '') ||
    /prefetch|prerender/i.test(headers.get('sec-purpose') ?? '')
  );
}
