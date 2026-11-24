import { headers } from 'next/headers';
import { NONCE_HEADER } from '@/lib/security-headers';
import { serializeJsonLd, type JsonLdObject } from '@/lib/structured-data';

/**
 * Data terstruktur (ADR-097). Blok data, bukan skrip — peramban tidak
 * menjalankannya — tetapi tetap diberi nonce supaya CSP ketat (ADR-027)
 * tidak pernah perlu `unsafe-inline` hanya karena elemen ini.
 */
export async function JsonLd({ data }: { data: JsonLdObject | readonly JsonLdObject[] | null }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
