import type { GraphNodeKind } from '@/lib/network-graph';

export const KIND_LABEL: Record<GraphNodeKind, string> = {
  me: 'Kamu',
  connection: 'Terhubung',
  incoming: 'Mengajakmu',
  outgoing: 'Menunggu jawaban',
  suggestion: 'Saran',
  interest: 'Minat',
  event: 'Kegiatan',
};

/**
 * Simbol keterangan — bentuknya SAMA dengan yang digambar kanvas. Jenis
 * simpul dibedakan lewat bentuk & isian, bukan warna (palet monokrom,
 * dan warna tidak boleh jadi satu-satunya pembawa makna).
 */
export function NodeGlyph({ kind, className }: { kind: GraphNodeKind; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={className}>
      {kind === 'me' && (
        <>
          <circle cx="6" cy="6" r="3.4" fill="var(--color-text-primary)" />
          <circle cx="6" cy="6" r="5.3" fill="none" stroke="var(--color-text-primary)" strokeWidth="1" />
        </>
      )}
      {kind === 'connection' && <circle cx="6" cy="6" r="4.6" fill="var(--color-text-primary)" />}
      {kind === 'incoming' && (
        <>
          <circle cx="6" cy="6" r="4.4" fill="var(--color-bg)" stroke="var(--color-text-primary)" strokeWidth="1.4" />
          <circle cx="6" cy="6" r="1.8" fill="var(--color-text-primary)" />
        </>
      )}
      {kind === 'outgoing' && (
        <circle cx="6" cy="6" r="4.4" fill="var(--color-bg)" stroke="var(--color-text-muted)" strokeWidth="1.3" strokeDasharray="2 1.6" />
      )}
      {kind === 'suggestion' && <circle cx="6" cy="6" r="4.4" fill="var(--color-bg)" stroke="var(--color-border-strong)" strokeWidth="1.4" />}
      {kind === 'interest' && <circle cx="6" cy="6" r="4.6" fill="var(--color-text-muted)" />}
      {kind === 'event' && <path d="M6 0.8 11.2 6 6 11.2 0.8 6Z" fill="var(--color-text-secondary)" />}
    </svg>
  );
}
