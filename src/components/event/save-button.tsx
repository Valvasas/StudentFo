import { Bookmark } from 'lucide-react';
import { toggleSaveEventAction } from '@/app/tracker/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SaveButtonProps {
  eventId: string;
  isSaved: boolean;
  returnTo?: string;
  variant?: 'icon' | 'full';
  className?: string;
}

export function SaveButton({
  eventId,
  isSaved,
  returnTo = '/events',
  variant = 'icon',
  className,
}: SaveButtonProps) {
  if (variant === 'full') {
    return (
      <form action={toggleSaveEventAction} className={className}>
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          variant={isSaved ? 'secondary' : 'ghost'}
          size="lg"
          className="w-full justify-center gap-2 border border-line"
        >
          <Bookmark
            aria-hidden
            className={cn('size-4', isSaved ? 'fill-brand text-brand' : 'text-ink-muted')}
          />
          <span>{isSaved ? 'Tersimpan di Tracker' : 'Simpan ke Tracker'}</span>
        </Button>
      </form>
    );
  }

  return (
    <form action={toggleSaveEventAction} className={cn('inline-block', className)}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className={cn(
          'relative z-10 flex size-9 items-center justify-center rounded-pill border border-line bg-panel transition-colors duration-150 ease-snap',
          isSaved
            ? 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20'
            : 'text-ink-muted hover:border-line-strong hover:bg-panel-nested hover:text-ink',
        )}
        title={isSaved ? 'Hapus dari simpanan' : 'Simpan kegiatan'}
        aria-label={isSaved ? 'Hapus dari simpanan' : 'Simpan kegiatan'}
      >
        <Bookmark
          aria-hidden
          className={cn('size-4', isSaved ? 'fill-brand text-brand' : 'text-current')}
        />
      </button>
    </form>
  );
}
