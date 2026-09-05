import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../theme';

import { NavBar, type NavBarProps } from './NavBar';

function renderNav(overrides: Partial<NavBarProps> = {}): {
  onRelative: ReturnType<typeof vi.fn>;
  onAbsolute: ReturnType<typeof vi.fn>;
} {
  const onRelative = vi.fn();
  const onAbsolute = vi.fn();
  const props: NavBarProps = {
    demoMode: false,
    lastLoadedAt: null,
    refreshing: false,
    error: undefined,
    refreshIntervalSeconds: 0,
    onReload: vi.fn(),
    viewRange: { kind: 'relative', window: '24h' },
    onRelative,
    onAbsolute,
    ...overrides,
  };
  render(
    <MemoryRouter>
      <ThemeProvider>
        <NavBar {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );
  return { onRelative, onAbsolute };
}

describe('NavBar', () => {
  it('exposes accessible names for theme, time range, and reload', () => {
    renderNav({ demoMode: true });
    expect(screen.getByRole('navigation', { name: 'Application' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'View time range' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeInTheDocument();
    expect(screen.getByTestId('demo-badge')).toBeInTheDocument();
  });

  it('calls onRelative when a relative window is chosen', async () => {
    const { onRelative } = renderNav();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), '6h');
    expect(onRelative).toHaveBeenCalledWith('6h');
  });

  it('offers a custom absolute range and calls onAbsolute', async () => {
    const { onAbsolute } = renderNav();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), 'custom');
    expect(onAbsolute).toHaveBeenCalledTimes(1);
    const [from, to] = onAbsolute.mock.calls[0] as [number, number];
    expect(to - from).toBe(24 * 3600);
  });

  it('disables reload when reloadDisabled is set', () => {
    renderNav({ reloadDisabled: true });
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  it('renders from/to inputs for an absolute range', () => {
    const { onAbsolute } = renderNav({
      viewRange: { kind: 'absolute', window: { fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 } },
    });
    const from = screen.getByLabelText('View time range from');
    expect(from).toBeInTheDocument();
    expect(screen.getByLabelText('View time range to')).toBeInTheDocument();
    fireEvent.change(from, { target: { value: '2023-11-14T22:00' } });
    expect(onAbsolute).toHaveBeenCalled();
  });
});
