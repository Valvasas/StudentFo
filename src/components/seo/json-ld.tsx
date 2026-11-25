import { serializeJsonLd, type JsonLdObject } from '@/lib/structured-data';

/**
 * Data terstruktur (ADR-097). Sengaja TANPA `nonce`: blok data
 * (`application/ld+json`) tidak pernah dieksekusi, jadi CSP `script-src`
 * (ADR-027) tidak berlaku untuknya. Nonce di sini justru merusak hidrasi —
 * peramban menyembunyikan nilai `nonce` dari DOM setelah parsing, sehingga
 * React melihat `nonce=""` di klien vs nilai asli dari server.
 */
export function JsonLd({ data }: { data: JsonLdObject | readonly JsonLdObject[] | null }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
