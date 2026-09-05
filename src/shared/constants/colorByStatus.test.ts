import { FALLBACK_STATUS, STATUS_COLOR } from './colorByStatus';

describe('colorByStatus', () => {
  it('maps each status to its hardcoded hex colour', () => {
    expect(STATUS_COLOR).toEqual({
      normal: '#73BF69',
      warning: '#F2CC0C',
      critical: '#E02F44',
    });
  });

  it('defaults absent/unknown status to normal (worst-status aggregation default)', () => {
    expect(FALLBACK_STATUS).toBe('normal');
  });
});
