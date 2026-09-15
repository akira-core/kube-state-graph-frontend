import { countWord } from './countWord';

describe('countWord', () => {
  it('singular only at exactly one', () => {
    expect(countWord(0, 'pod')).toBe('0 pods');
    expect(countWord(1, 'pod')).toBe('1 pod');
    expect(countWord(2, 'pod')).toBe('2 pods');
  });

  it('takes an explicit plural', () => {
    expect(countWord(1, 'PVC')).toBe('1 PVC');
    expect(countWord(3, 'PVC')).toBe('3 PVCs');
    expect(countWord(2, 'switch', 'switches')).toBe('2 switches');
  });
});
