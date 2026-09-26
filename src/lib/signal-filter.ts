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
