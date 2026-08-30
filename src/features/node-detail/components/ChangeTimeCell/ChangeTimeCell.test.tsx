import { render, screen } from '@testing-library/react';
import React from 'react';

import { ChangeTimeCell } from './ChangeTimeCell';

describe('ChangeTimeCell', () => {
  it('renders the pre-formatted value with the raw ISO as title', () => {
    render(<ChangeTimeCell formatted="2026-06-16 10:30:00" title="2026-06-16T10:30:00Z" testId="t" />);
    const el = screen.getByTestId('t');
    expect(el.textContent).toBe('2026-06-16 10:30:00');
    expect(el.getAttribute('title')).toBe('2026-06-16T10:30:00Z');
  });

  it('renders a muted "n/a" with no title when formatted is undefined', () => {
    render(<ChangeTimeCell formatted={undefined} testId="t" />);
    const el = screen.getByTestId('t');
    expect(el.textContent).toBe('n/a');
    expect(el.getAttribute('title')).toBeNull();
  });
});
