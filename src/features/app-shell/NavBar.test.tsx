import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../theme';

import { NavBar, type NavBarProps } from './NavBar';

function renderNav(
  overrides: Partial<NavBarProps> = {},
  path = '/graph'
): {
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
    <MemoryRouter initialEntries={[path]}>
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

  it('shows the awaiting-Query readout and disables Reload', () => {
    renderNav({ phase: 'awaiting', lastLoadedAt: null });
    expect(screen.getByTestId('nav-status-readout')).toHaveTextContent('awaiting Query');
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  it('shows cancelled with the last load time still visible', () => {
    renderNav({ phase: 'cancelled', lastLoadedAt: Date.parse('2026-01-01T12:00:00') });
    expect(screen.getByTestId('nav-status-readout')).toHaveTextContent('cancelled');
    expect(screen.getByTestId('nav-status-readout').textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeEnabled();
  });

  it('disables Reload while phase is loading', () => {
    renderNav({ phase: 'loading', refreshing: true, lastLoadedAt: Date.parse('2026-01-01T12:00:00') });
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  describe('standalone pages', () => {
    it('The nav bar links nowhere', () => {
      for (const path of ['/graph', '/sankey', '/network/sankey']) {
        const { unmount } = render(
          <MemoryRouter initialEntries={[path]}>
            <ThemeProvider>
              <NavBar
                demoMode
                lastLoadedAt={null}
                refreshing={false}
                error={undefined}
                refreshIntervalSeconds={0}
                onReload={vi.fn()}
                viewRange={{ kind: 'relative', window: '24h' }}
                onRelative={vi.fn()}
                onAbsolute={vi.fn()}
              />
            </ThemeProvider>
          </MemoryRouter>
        );
        const nav = screen.getByRole('navigation', { name: 'Application' });
        expect(within(nav).queryAllByRole('link')).toHaveLength(0);
        expect(within(nav).getByText('Kube State Graph')).toBeInTheDocument();
        expect(within(nav).getByRole('combobox', { name: 'View time range' })).toBeInTheDocument();
        expect(within(nav).getByTestId('nav-status-readout')).toBeInTheDocument();
        expect(within(nav).getByRole('button', { name: 'Reload data' })).toBeInTheDocument();
        expect(within(nav).getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
        expect(within(nav).getByTestId('demo-badge')).toBeInTheDocument();
        unmount();
      }
    });

    it("The current view's link is presented as active", () => {
      renderNav({}, '/sankey');
      const nav = screen.getByRole('navigation', { name: 'Application' });
      for (const name of ['Graph', 'Sankey', 'Storage', 'Network']) {
        expect(within(nav).queryByRole('link', { name })).not.toBeInTheDocument();
      }
      expect(nav.querySelector('[aria-current]')).toBeNull();
      expect(screen.queryByRole('group', { name: 'Category' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('nav-category')).not.toBeInTheDocument();
      expect(screen.queryByTestId('nav-view')).not.toBeInTheDocument();
    });
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
