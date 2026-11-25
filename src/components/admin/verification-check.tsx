import { VERIFICATION_LEVEL_LABEL } from '@/types/domain';

/** Nama field yang dibaca `reviewEventAction`/`reviewSubmissionAction` (ADR-096). */
export const VERIFIED_FIELD = 'verified';

/**
 * Pilihan sadar moderator saat menyetujui: tanpa centang, kegiatan tayang
 * sebagai "Dari sumber publik". Centang hanya bila detailnya sudah dicocokkan
 * LANGSUNG dengan kanal resmi penyelenggara — bukan sekadar "tautannya hidup".
 */
export function VerificationCheck({ form }: { form?: string }) {
  return (
    <label className="choice min-h-11 py-1.5 text-[13px] leading-snug">
      <input type="checkbox" name={VERIFIED_FIELD} value="1" form={form} className="check shrink-0" />
      <span>
        Sudah kucocokkan langsung ke kanal resmi penyelenggara → <strong className="font-semibold">{VERIFICATION_LEVEL_LABEL.MODERATOR_VERIFIED}</strong>
      </span>
    </label>
  );
}
