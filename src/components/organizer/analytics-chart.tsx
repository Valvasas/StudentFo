import { formatShortDateId } from '@/lib/deadline';
import type { AnalyticsDay } from '@/types/domain';

const WIDTH = 720;
const HEIGHT = 220;
const PAD_TOP = 12;

/** Batas atas sumbu yang "bulat" (1/2/5 × 10^n) supaya garis bantu terbaca. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= value) ?? 10;
  return step * magnitude;
}

function pointsOf(series: readonly AnalyticsDay[], key: 'views' | 'visitors', max: number): string {
  const stepX = series.length > 1 ? WIDTH / (series.length - 1) : WIDTH;
  return series
    .map((day, index) => {
      const x = index * stepX;
      const y = PAD_TOP + (HEIGHT - PAD_TOP) * (1 - day[key] / max);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Kunjungan harian: area = pengunjung unik, garis = total kunjungan.
 *
 * SVG yang dirender server, bukan pustaka grafik: nol JavaScript di klien,
 * tampil tanpa JS, dan tidak menambah bundle untuk satu grafik. Angka
 * lengkapnya ada di tabel tersembunyi untuk pembaca layar (grafik saja tidak
 * bisa dibaca mereka), dan `<title>` per titik tidak dipakai karena tidak
 * terjangkau keyboard.
 */
export function VisitsChart({ series }: { series: readonly AnalyticsDay[] }) {
  const peak = Math.max(0, ...series.map((day) => Math.max(day.views, day.visitors)));
  const max = niceMax(peak);
  const visitors = pointsOf(series, 'visitors', max);
  const views = pointsOf(series, 'views', max);
  const first = series[0];
  const last = series.at(-1);
  const middle = series[Math.floor(series.length / 2)];
  const totalVisitors = series.reduce((sum, day) => sum + day.visitors, 0);

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand" /> Pengunjung unik
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-pill bg-ink-muted" /> Total kunjungan
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-[220px] w-full overflow-visible"
          role="img"
          aria-label={`Grafik kunjungan harian, ${series.length} hari. Total ${totalVisitors.toLocaleString('id-ID')} pengunjung unik; puncak ${peak.toLocaleString('id-ID')} kunjungan dalam sehari.`}
        >
          {[0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = PAD_TOP + (HEIGHT - PAD_TOP) * (1 - fraction);
            return <line key={fraction} x1={0} x2={WIDTH} y1={y} y2={y} className="stroke-line" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />;
          })}
          <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-line-strong" vectorEffect="non-scaling-stroke" />
          {series.length > 1 && (
            <>
              <polygon points={`0,${HEIGHT} ${visitors} ${WIDTH},${HEIGHT}`} className="chart-fade fill-brand/15" />
              <polyline
                points={visitors}
                pathLength={1}
                fill="none"
                className="chart-draw stroke-brand"
                strokeWidth={2.25}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={views}
                pathLength={1}
                fill="none"
                className="chart-draw stroke-ink-muted [animation-delay:150ms]"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        <span className="pointer-events-none absolute right-0 top-0 -translate-y-1/2 rounded-sm bg-canvas px-1 font-mono text-[11px] text-ink-muted" aria-hidden>
          {max.toLocaleString('id-ID')}
        </span>
      </div>
      <div className="flex justify-between font-mono text-[11.5px] text-ink-muted" aria-hidden>
        <span>{first ? formatShortDateId(`${first.day}T05:00:00Z`) : ''}</span>
        <span className="hidden sm:inline">{middle ? formatShortDateId(`${middle.day}T05:00:00Z`) : ''}</span>
        <span>{last ? formatShortDateId(`${last.day}T05:00:00Z`) : ''}</span>
      </div>
      {/* sr-only di pembungkus, bukan di <table>: tabel mengabaikan width 1px
          dan tetap selebar isinya — halaman ponsel jadi bisa digeser 170px. */}
      <div className="sr-only">
        <table>
          <caption>Kunjungan harian</caption>
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">Pengunjung unik</th>
              <th scope="col">Total kunjungan</th>
              <th scope="col">Disimpan</th>
              <th scope="col">Klik daftar</th>
            </tr>
          </thead>
          <tbody>
            {series.map((day) => (
              <tr key={day.day}>
                <th scope="row">{day.day}</th>
                <td>{day.visitors}</td>
                <td>{day.views}</td>
                <td>{day.saves}</td>
                <td>{day.clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Mini-grafik batang harian untuk kartu KPI (simpan, klik). Dekoratif — angkanya ada di kartu. */
export function Sparkbars({ series, metric }: { series: readonly AnalyticsDay[]; metric: 'saves' | 'clicks' | 'visitors' | 'views' }) {
  const max = Math.max(1, ...series.map((day) => day[metric]));
  return (
    <span aria-hidden className="flex h-8 items-end gap-px">
      {series.map((day, index) => (
        <span
          key={day.day}
          className="chart-fade min-h-px flex-1 rounded-t-[1px] bg-brand/60"
          style={{ height: `${(day[metric] / max) * 100}%`, animationDelay: `${Math.min(index * 12, 600)}ms` }}
        />
      ))}
    </span>
  );
}
