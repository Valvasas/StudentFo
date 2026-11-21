import 'server-only';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { processMediaImports, type MediaImportRun } from './process';
import { fetchRemoteImage, resolveAllAddresses } from './remote-image';
import { renderMediaImage } from './render';

/** Pemroses dengan dependensi sungguhan — dipakai cron dan tombol admin (ADR-095). */
export async function runMediaImports(limit: number): Promise<MediaImportRun> {
  const repository = await getEventRepository();
  // User-Agent jujur dengan alamat sumber-data, sama semangatnya dengan pipeline scraper.
  const userAgent = `StudentFoBot/1.0 (+${siteUrl.replace(/\/$/, '')}/sumber-data)`;
  return processMediaImports(
    {
      repository,
      fetchImage: (url) => fetchRemoteImage(url, { fetch, resolve: resolveAllAddresses, userAgent }),
      render: renderMediaImage,
    },
    limit,
  );
}
