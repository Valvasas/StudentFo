import { BarChart3 } from 'lucide-react';
import type { OptionCount, QuestionSummary } from '@/lib/registration-summary';
import { cn } from '@/lib/utils';
import { FORM_FIELD_TYPE_LABEL } from '@/types/domain';

const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 1 });
const percent = (share: number) => Math.round(share * 100);

/**
 * Batang = hiasan (aria-hidden); angka & persen selalu tertulis sebagai teks,
 * jadi pembaca layar dan cetak hitam-putih tetap dapat isinya. Nol = tanpa
 * batang — batang minimal 2% membuat "tidak ada yang memilih" terlihat ada.
 */
function Bars({ rows }: { rows: readonly OptionCount[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row, index) => (
        <li key={`${row.label}-${index}`} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">{row.label}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">
              {number(row.count)}
              <span className="text-ink-muted"> · {percent(row.share)}%</span>
            </span>
          </span>
          <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-panel-nested">
            <span
              className="grow-x block h-full rounded-pill bg-brand"
              style={{ width: `${row.count > 0 ? Math.max(2, percent(row.share)) : 0}%`, animationDelay: `${index * 60}ms` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-ink-muted">{children}</p>;
}

function Body({ summary }: { summary: QuestionSummary }) {
  if (summary.answered === 0) return <p className="text-sm text-ink-muted">Belum ada jawaban.</p>;
  switch (summary.kind) {
    case 'choice':
      return (
        <>
          <Bars rows={summary.options} />
          {summary.multiple && <Note>Boleh lebih dari satu pilihan — persentase terhadap yang menjawab, totalnya bisa lebih dari 100%.</Note>}
          {summary.other > 0 && <Note>{number(summary.other)} jawaban memakai pilihan yang sudah diubah atau dihapus dari formulir.</Note>}
          {summary.field.type === 'team_status' && (
            <Note>
              Pendaftar yang belum punya tim atau masih kurang anggota otomatis ditawari pencocokan partner, daftar tim terbuka, dan lobi lomba
              sesudah mendaftar.
            </Note>
          )}
        </>
      );
    case 'consent':
      return <Bars rows={[{ label: 'Setuju', count: summary.yes, share: summary.yes / summary.answered }]} />;
    case 'scale': {
      const lowLabel = summary.field.scale?.lowLabel;
      const highLabel = summary.field.scale?.highLabel;
      const last = summary.options.length - 1;
      return (
        <>
          <p className="text-sm">
            Rata-rata <strong className="tabular-nums">{number(summary.mean ?? 0)}</strong>
            <span className="text-ink-muted"> dari {summary.options.length}</span>
          </p>
          <Bars
            rows={summary.options.map((option, index) => ({
              ...option,
              label: index === 0 && lowLabel ? `${option.label} — ${lowLabel}` : index === last && highLabel ? `${option.label} — ${highLabel}` : option.label,
            }))}
          />
        </>
      );
    }
    case 'number':
      return (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ['Rata-rata', summary.mean],
              ['Median', summary.median],
              ['Terkecil', summary.min],
              ['Terbesar', summary.max],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12.5px] text-ink-muted">{label}</dt>
              <dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{value === null ? '—' : number(value)}</dd>
            </div>
          ))}
        </dl>
      );
    case 'grouped':
      return (
        <>
          <Bars rows={summary.groups} />
          <Note>
            Huruf besar-kecil & spasi tidak dibedakan.
            {summary.more > 0 && ` Ada ${number(summary.more)} jawaban berbeda lainnya — lihat tampilan Daftar atau CSV.`}
          </Note>
        </>
      );
    case 'text':
      return (
        <>
          <ul className="flex flex-col gap-2">
            {summary.samples.map((sample, index) => (
              <li key={index} className="line-clamp-4 whitespace-pre-line rounded-card bg-panel-nested px-3 py-2 text-sm [overflow-wrap:anywhere]">
                {sample}
              </li>
            ))}
          </ul>
          {summary.answered > summary.samples.length && (
            <Note>Menampilkan {summary.samples.length} jawaban terbaru — semuanya ada di tampilan Daftar & CSV.</Note>
          )}
        </>
      );
    case 'count':
      return <Note>Isian {FORM_FIELD_TYPE_LABEL[summary.field.type].toLowerCase()} tidak diringkas — datanya per pendaftar ada di tampilan Daftar & CSV.</Note>;
  }
}

/**
 * "Ringkasan jawaban" (ADR-092) — padanan tab Ringkasan Google Form untuk
 * formulir StudentFo. Server component murni: data diagregasi di
 * `lib/registration-summary.ts`, tanpa pustaka grafik & tanpa JS klien.
 */
export function AnswerSummary({ questions, total, className }: { questions: readonly QuestionSummary[]; total: number; className?: string }) {
  return (
    <section aria-labelledby="ringkasan-jawaban" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-1">
        <h2 id="ringkasan-jawaban" className="flex items-center gap-2 text-xl">
          <BarChart3 aria-hidden className="size-5 text-ink-muted" />
          Ringkasan jawaban
        </h2>
        <p className="text-sm text-ink-muted">
          Dari {number(total)} pendaftar aktif. Pendaftar yang batal atau ditolak tidak dihitung; pertanyaan opsional bisa punya
          jawaban lebih sedikit.
        </p>
      </div>
      {questions.length === 0 ? (
        <p className="rounded-panel border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
          Formulir ini belum punya pertanyaan tambahan — hanya nama & email pendaftar.
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {questions.map((summary) => (
            <section
              key={summary.field.id}
              aria-labelledby={`ringkasan-${summary.field.id}`}
              className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card"
            >
              <div className="flex flex-col gap-0.5">
                <h3 id={`ringkasan-${summary.field.id}`} className="text-base font-semibold [overflow-wrap:anywhere]">
                  {summary.field.label}
                </h3>
                <p className="text-[12.5px] text-ink-muted">
                  {FORM_FIELD_TYPE_LABEL[summary.field.type]} · {number(summary.answered)} dari {number(total)} menjawab
                </p>
              </div>
              <Body summary={summary} />
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
