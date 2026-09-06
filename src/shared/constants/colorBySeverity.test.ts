import { FALLBACK_SEVERITY_COLOR, SEVERITY_COLOR, severityColor } from './colorBySeverity';
import { STATUS_COLOR } from './colorByStatus';

describe('severityColor', () => {
  it('maps each known tier to its badge colour', () => {
    expect(severityColor('info')).toBe(SEVERITY_COLOR.info);
    expect(severityColor('warning')).toBe(SEVERITY_COLOR.warning);
    expect(severityColor('critical')).toBe(SEVERITY_COLOR.critical);
  });

  // info is the BENIGN tier: it shares the panel's healthy green (#73BF69, the same
  // green as STATUS_COLOR.normal) so a folded controller / alert badge whose worst
  // severity is only info reads as "nothing serious" — never the cool blue it used to.
  it('uses the panel healthy-green for the benign info tier (same green as status-normal)', () => {
    expect(SEVERITY_COLOR.info).toBe('#73BF69');
    expect(SEVERITY_COLOR.info).toBe(STATUS_COLOR.normal);
  });

  it('falls back to the critical colour for unknown / custom / empty labels (fail-loud, no data lost)', () => {
    expect(severityColor('fatal')).toBe(FALLBACK_SEVERITY_COLOR);
    expect(severityColor('P1')).toBe(FALLBACK_SEVERITY_COLOR);
    expect(severityColor('normal')).toBe(FALLBACK_SEVERITY_COLOR);
    expect(severityColor('')).toBe(FALLBACK_SEVERITY_COLOR);
  });

  it('treats the fallback AS the critical tier (unknown severity reads as most-severe)', () => {
    expect(FALLBACK_SEVERITY_COLOR).toBe(SEVERITY_COLOR.critical);
  });
});
