import { render, screen } from '@testing-library/react';
import React from 'react';

import { FALLBACK_RESULT_TYPE_COLOR, RESULT_TYPE_COLOR } from '../../../../shared/constants/colorByResultType';

import { ChangeTypeCell } from './ChangeTypeCell';

describe('ChangeTypeCell', () => {
  it('renders a known result_type as coloured text', () => {
    render(<ChangeTypeCell type="UPDATED" testId="t" />);
    const el = screen.getByTestId('t');
    expect(el.textContent).toBe('UPDATED');
    expect(el).toHaveStyle({ color: RESULT_TYPE_COLOR.UPDATED });
  });

  it('colours and upper-cases a lower-case backend value (case-insensitive lookup + uppercase-display contract)', () => {
    render(<ChangeTypeCell type="updated" testId="t" />);
    const el = screen.getByTestId('t');
    // The raw value stays in the DOM — display upper-casing is CSS-only (invisible to textContent).
    expect(el.textContent).toBe('updated');
    // Pins the "顯示一律大寫" contract that textContent cannot observe.
    expect(el).toHaveStyle({ textTransform: 'uppercase' });
    // Colour resolves case-insensitively to the known UPDATED tier.
    expect(el).toHaveStyle({ color: RESULT_TYPE_COLOR.UPDATED });
  });

  it('renders an unknown result_type verbatim with the neutral fallback colour (visible-by-default)', () => {
    render(<ChangeTypeCell type="MIGRATED" testId="t" />);
    const el = screen.getByTestId('t');
    expect(el.textContent).toBe('MIGRATED');
    expect(el).toHaveStyle({ color: FALLBACK_RESULT_TYPE_COLOR });
  });

  it('renders a muted "n/a" when type is undefined', () => {
    render(<ChangeTypeCell type={undefined} testId="t" />);
    expect(screen.getByTestId('t').textContent).toBe('n/a');
  });

  it('renders a muted "n/a" when type is an empty string', () => {
    render(<ChangeTypeCell type="" testId="t" />);
    expect(screen.getByTestId('t').textContent).toBe('n/a');
  });
});
