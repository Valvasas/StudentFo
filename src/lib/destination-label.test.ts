import { describe, expect, it } from 'vitest';
import { destinationLabel } from './destination-label';

describe('destinationLabel', () => {
  it('mengenali halaman yang meminta masuk, dengan atau tanpa query', () => {
    expect(destinationLabel('/pembayaran')).toBe('Pendaftaran & pembayaran');
    expect(destinationLabel('/pembayaran/abc-123?notice=x')).toBe('Pendaftaran & pembayaran');
    expect(destinationLabel('/events/workshop-riset/formulir')).toBe('formulir pendaftaran');
    expect(destinationLabel('/teams/baru')).toBe('form buka tim');
    expect(destinationLabel('/teams/cocok')).toBe('pencocokan tim');
    expect(destinationLabel('/tracker/beasiswa-x')).toBe('Papan lamaran');
  });

  it('tujuan yang tidak dikenal tidak dikutip', () => {
    expect(destinationLabel('/')).toBeNull();
    expect(destinationLabel('/events')).toBeNull();
    expect(destinationLabel('/admin')).toBeNull();
    expect(destinationLabel('/pembayaran-palsu')).toBeNull();
    expect(destinationLabel('/profile-lain')).toBeNull();
  });
});
