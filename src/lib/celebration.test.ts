import { describe, expect, it } from 'vitest';
import { celebrationFor } from './celebration';

describe('celebrationFor', () => {
  it('merayakan momen yang ditunggu orang', () => {
    expect(celebrationFor('tracker_applied')).toMatchObject({ stamp: 'TERCATAT', confetti: true });
    expect(celebrationFor('submission_received')).toMatchObject({ art: 'plane', confetti: false });
    expect(celebrationFor('email_confirmed')?.confetti).toBe(true);
  });

  it('tidak merayakan kabar netral/sensitif, kode tak dikenal, atau properti prototype', () => {
    expect(celebrationFor('person_blocked')).toBeNull();
    expect(celebrationFor('connection_removed')).toBeNull();
    expect(celebrationFor('team_created')).toBeNull();
    expect(celebrationFor('constructor')).toBeNull();
    expect(celebrationFor(null)).toBeNull();
  });
});
