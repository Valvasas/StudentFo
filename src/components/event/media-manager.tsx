import Image from 'next/image';
import { Film, Images, ShieldAlert, Star, StarOff, Trash2 } from 'lucide-react';
import { deletePhotoAction, saveVideoAction, setPosterAction, uploadPhotosAction } from '@/app/penyelenggara/acara/[id]/galeri/actions';
import { EventMedia } from '@/components/event/event-media';
import { photoAlt, photoSrc } from '@/components/event/event-photo';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { GALLERY_LIMITS } from '@/lib/data/repository';
import type { MediaContext } from '@/lib/media-paths';
import { cn } from '@/lib/utils';
import { parseVideo } from '@/lib/video';
import type { EventPhoto } from '@/types/domain';

interface Target {
  readonly context: MediaContext;
  readonly eventId: string;
  readonly slug: string;
}

/** Kolom tersembunyi di setiap form: aksi menghitung tujuan kembali dari sini, hak dari repository. */
function TargetFields({ context, eventId, slug }: Target) {
  return (
    <>
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="slug" value={slug} />
    </>
  );
}

/**
 * Kelola poster, foto, dan video satu acara (ADR-056, ADR-079) — studio
 * penyelenggara & halaman media admin memakai komponen yang sama, dan
 * pratinjaunya adalah slide yang sama persis dengan yang dilihat pengunjung.
 */
export function MediaManager({
  context,
  event,
  photos,
}: {
  context: MediaContext;
  event: { readonly id: string; readonly slug: string; readonly title: string; readonly videoUrl?: string | null };
  photos: readonly EventPhoto[];
}) {
  const target: Target = { context, eventId: event.id, slug: event.slug };
  const remaining = Math.max(0, GALLERY_LIMITS.perEvent - photos.length);
  const hasPoster = photos.some((photo) => photo.isPoster);
  const hasMedia = photos.length > 0 || Boolean(parseVideo(event.videoUrl));

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
        <UploadCard target={target} used={photos.length} remaining={remaining} hasPoster={hasPoster} />
        <VideoCard target={target} videoUrl={event.videoUrl ?? null} />
      </div>

      <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-1">
        <section aria-labelledby="foto-galeri" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="foto-galeri" className="text-lg font-semibold">
              Poster & foto
            </h2>
            <p className="max-w-prose text-sm text-ink-muted">
              {hasPoster
                ? 'Poster tampil pertama di slide halaman acara, sebagai gambar kecil di kartu kegiatan, dan saat tautan acara dibagikan.'
                : 'Belum ada poster. Pilih satu foto sebagai poster — atau centang “jadikan poster” saat mengunggah — supaya acara ini punya wajah di daftar kegiatan.'}
            </p>
          </div>
          {photos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-line bg-panel px-6 py-12 text-center">
              <Images aria-hidden className="size-8 text-ink-faint" />
              <p className="font-semibold">Belum ada foto</p>
              <p className="max-w-sm text-sm text-ink-muted">
                Poster resmi, foto edisi sebelumnya, atau suasana acara membantu calon peserta tahu gambarannya dan percaya acaramu benar-benar ada.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {photos.map((photo, index) => (
                <PhotoCard key={photo.id} photo={photo} position={index + 1} eventTitle={event.title} target={target} />
              ))}
            </ul>
          )}
        </section>

        {hasMedia && (
          <section aria-labelledby="pratinjau" className="flex flex-col gap-4">
            <h2 id="pratinjau" className="text-lg font-semibold">
              Tampilan di halaman acara
            </h2>
            <div className="rounded-panel border border-line bg-canvas p-4 sm:p-5">
              <EventMedia photos={photos} videoUrl={event.videoUrl} eventTitle={event.title} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function UploadCard({ target, used, remaining, hasPoster }: { target: Target; used: number; remaining: number; hasPoster: boolean }) {
  const perUpload = Math.min(GALLERY_LIMITS.perUpload, remaining);
  return (
    <section aria-labelledby="tambah-foto" className="flex flex-col gap-5 rounded-panel border border-line bg-panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tambah-foto" className="text-lg font-semibold">
          Tambah poster atau foto
        </h2>
        <p className="text-sm tabular-nums text-ink-muted">
          <span className="font-semibold text-ink">{used}</span> / {GALLERY_LIMITS.perEvent}
          <span className="sr-only"> foto terpakai</span>
        </p>
      </div>

      {remaining > 0 ? (
        <form action={uploadPhotosAction} className="flex flex-col gap-4">
          <TargetFields {...target} />
          <ImageUploadField
            id="photos"
            name="photos"
            label="Gambar"
            hint={`Maks. ${perUpload} gambar sekali unggah, masing-masing hingga 5 MB. Poster tegak (4:5) tampil paling baik.`}
            multiple
            maxFiles={perUpload}
            required
          />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-snug text-ink-soft">
            <input type="checkbox" name="asPoster" defaultChecked={!hasPoster} className="check mt-px" />
            <span>
              Jadikan gambar pertama sebagai poster
              {hasPoster && <span className="block text-[12.5px] text-ink-muted">Poster yang sekarang akan diganti.</span>}
            </span>
          </label>
          <Field id="caption" label="Keterangan (opsional)" hint="Berlaku untuk semua gambar di unggahan ini.">
            <TextInput id="caption" name="caption" maxLength={GALLERY_LIMITS.captionMax} placeholder="mis. Babak final 2025" />
          </Field>
          <p className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-muted">
            <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" />
            Jangan unggah gambar yang memuat data pribadi (KTP, nomor HP pribadi, alamat rumah) atau foto anak tanpa izin orang tuanya.
          </p>
          <SubmitButton className={buttonVariants()} pendingLabel="Mengunggah…">
            Unggah
          </SubmitButton>
        </form>
      ) : (
        <p className="rounded-card bg-panel-nested p-3 text-sm text-ink-soft">Galeri sudah penuh. Hapus foto lama untuk menambah yang baru.</p>
      )}
    </section>
  );
}

function VideoCard({ target, videoUrl }: { target: Target; videoUrl: string | null }) {
  const video = parseVideo(videoUrl);
  return (
    <section aria-labelledby="video-acara" className="flex flex-col gap-4 rounded-panel border border-line bg-panel p-5 sm:p-6">
      <h2 id="video-acara" className="flex items-center gap-2 text-lg font-semibold">
        <Film aria-hidden className="size-5 text-ink-muted" /> Video
      </h2>
      <form action={saveVideoAction} className="flex flex-col gap-4">
        <TargetFields {...target} />
        <Field
          id="videoUrl"
          label="Tautan YouTube atau Vimeo"
          hint="Teaser, rekap edisi lalu, atau penjelasan teknis. Pengunjung memutarnya dari slide; YouTube baru dihubungi setelah mereka menekan putar."
        >
          <TextInput
            id="videoUrl"
            name="videoUrl"
            inputMode="url"
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            defaultValue={video?.url ?? ''}
            placeholder="https://youtu.be/…"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <SubmitButton className={buttonVariants()} pendingLabel="Menyimpan…">
            Simpan video
          </SubmitButton>
          {video && (
            <SubmitButton name="remove" value="on" formNoValidate className={buttonVariants({ variant: 'secondary' })} pendingLabel="Melepas…">
              Lepas video
            </SubmitButton>
          )}
        </div>
      </form>
    </section>
  );
}

function PhotoCard({ photo, position, eventTitle, target }: { photo: EventPhoto; position: number; eventTitle: string; target: Target }) {
  const name = photo.isPoster ? 'poster' : `foto ke-${position}`;
  return (
    <li className={cn('flex min-w-0 flex-col overflow-hidden rounded-card border bg-panel', photo.isPoster ? 'border-ink' : 'border-line')}>
      <div className="relative aspect-[4/5] bg-panel-nested">
        <Image
          src={photoSrc(photo.id)}
          alt={photoAlt(photo, position, eventTitle)}
          width={photo.width}
          height={photo.height}
          sizes="(min-width: 1280px) 200px, (min-width: 1024px) 26vw, (min-width: 640px) 33vw, 50vw"
          className="absolute inset-0 size-full object-contain"
        />
        {photo.isPoster && (
          <Badge variant="neutral" className="absolute left-2 top-2 bg-panel/90 text-ink shadow-sm">
            Poster
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2.5 pb-1 pt-2">
        {photo.caption && <p className="line-clamp-2 text-[13px] leading-snug text-ink-soft">{photo.caption}</p>}
        <form action={setPosterAction} className="mt-auto">
          <TargetFields {...target} />
          <input type="hidden" name="photoId" value={photo.id} />
          <input type="hidden" name="poster" value={photo.isPoster ? 'off' : 'on'} />
          <SubmitButton
            aria-label={photo.isPoster ? 'Lepas poster' : `Jadikan ${name} sebagai poster`}
            className="flex min-h-11 w-fit items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {photo.isPoster ? <StarOff aria-hidden className="size-4" /> : <Star aria-hidden className="size-4" />}
            {photo.isPoster ? 'Lepas poster' : 'Jadikan poster'}
          </SubmitButton>
        </form>
        <details className="group">
          <summary
            aria-label={`Hapus ${name}`}
            className={cn(
              'flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-ink-muted',
              'hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus group-open:text-danger [&::-webkit-details-marker]:hidden',
            )}
          >
            <Trash2 aria-hidden className="size-4" /> Hapus
          </summary>
          <form action={deletePhotoAction} className="pop flex flex-col gap-2 pb-2">
            <TargetFields {...target} />
            <input type="hidden" name="photoId" value={photo.id} />
            <p className="text-[12.5px] leading-snug text-ink-muted">
              {photo.isPoster ? 'Poster langsung hilang dari halaman acara dan kartu kegiatan.' : 'Foto langsung hilang dari halaman acara.'}
            </p>
            <SubmitButton aria-label={`Ya, hapus ${name}`} className={cn(buttonVariants({ variant: 'danger' }), 'w-full')}>
              Ya, hapus
            </SubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}
