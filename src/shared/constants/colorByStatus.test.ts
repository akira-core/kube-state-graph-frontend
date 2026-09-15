import { FALLBACK_STATUS, STATUS_COLOR, worstStatus } from './colorByStatus';

describe('colorByStatus', () => {
  it('worstStatus folds by rank and stays null when nothing was judged', () => {
    expect(worstStatus([])).toBeNull();
    expect(worstStatus([null, undefined])).toBeNull();
    expect(worstStatus([undefined, 'normal'])).toBe('normal');
    expect(worstStatus(['normal', 'critical', 'warning'])).toBe('critical');
    expect(worstStatus(['warning', null, 'normal'])).toBe('warning');
  });

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
