import { FALLBACK_RESULT_TYPE_COLOR, RESULT_TYPE_COLOR, RESULT_TYPES, resultTypeColor } from './colorByResultType';

describe('colorByResultType', () => {
  it('maps every known result_type to its palette colour', () => {
    for (const type of RESULT_TYPES) {
      expect(resultTypeColor(type)).toBe(RESULT_TYPE_COLOR[type]);
    }
  });

  it('locks the semantic palette (hardcoded hex, mirrors STATUS_COLOR/SEVERITY_COLOR)', () => {
    expect(RESULT_TYPE_COLOR).toEqual({
      UNCHANGED: '#8E8E8E',
      UPDATED: '#3274D9',
      REPLACED: '#FF9830',
      ADDED: '#73BF69',
      REMOVED: '#E02F44',
      RENAMED: '#B877D9',
      REVERTED: '#F2CC0C',
    });
  });

  it('returns the neutral fallback for an unknown result_type (visible-by-default, never blank)', () => {
    expect(resultTypeColor('MIGRATED')).toBe(FALLBACK_RESULT_TYPE_COLOR);
    expect(resultTypeColor('')).toBe(FALLBACK_RESULT_TYPE_COLOR);
    expect(FALLBACK_RESULT_TYPE_COLOR).toBe('#8E8E8E');
  });

  it('looks up colours case-insensitively (backend casing drift is tolerated)', () => {
    expect(resultTypeColor('updated')).toBe(RESULT_TYPE_COLOR.UPDATED);
    expect(resultTypeColor('Added')).toBe(RESULT_TYPE_COLOR.ADDED);
    expect(resultTypeColor('removed')).toBe(RESULT_TYPE_COLOR.REMOVED);
  });
});
