import { ImageResponse } from 'next/og';
import { OG_SIZE, OgCard } from '@/components/og/og-card';

export const alt = 'StudentFo — info lomba, beasiswa, dan magang untuk pelajar & mahasiswa Indonesia';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="Untuk SMA/SMK & mahasiswa"
        title="Info lomba, beasiswa, dan magang — rapi, dari sumber yang jelas."
        subtitle="Satu tempat, lengkap dengan sisa waktu pendaftaran."
        footnote="studentfo"
      />
    ),
    size,
  );
}
