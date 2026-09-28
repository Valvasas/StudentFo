import { ImageResponse } from 'next/og';
import { clampText, OG_SIZE, OgCard } from '@/components/og/og-card';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { EVENT_TYPE_LABEL } from '@/types/domain';

export const alt = 'Pratinjau kegiatan di StudentFo';
export const size = OG_SIZE;
export const contentType = 'image/png';

/**
 * Kartu pratinjau per kegiatan — yang terlihat saat tautan dibagikan di
 * WhatsApp/Telegram/IG, jalur penyebaran utama info lomba.
 *
 * Tanggal ABSOLUT, bukan "H-5": aplikasi obrolan men-cache gambar pratinjau
 * berhari-hari, jadi hitung mundur di gambar akan basi dan menyesatkan.
 * Kegiatan yang tidak (lagi) publik jatuh ke kartu umum, bukan 404 — tidak
 * membocorkan apa pun tentang slug yang tidak tayang.
 */
export default async function EventOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await (await getEventRepository()).getEventBySlug(slug);

  if (!event) {
    return new ImageResponse(
      <OgCard eyebrow="StudentFo" title="Kegiatan untuk pelajar & mahasiswa" subtitle={null} footnote="studentfo" />,
      size,
    );
  }

  const deadline = event.primaryDeadlineAt ? `Pendaftaran ditutup ${formatDateId(event.primaryDeadlineAt)}` : 'Tenggat belum diumumkan';
  return new ImageResponse(
    (
      <OgCard
        eyebrow={EVENT_TYPE_LABEL[event.eventType]}
        title={clampText(event.title, 90)}
        subtitle={clampText(event.organizer, 70)}
        footnote={deadline}
      />
    ),
    size,
  );
}
