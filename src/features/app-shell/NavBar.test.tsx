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

  describe('category and view groups', () => {
    function hrefsOf(group: HTMLElement): Record<string, string | null> {
      return Object.fromEntries(
        within(group)
          .getAllByRole('link')
          .map((link) => [link.textContent ?? '', link.getAttribute('href')])
      );
    }

    it('offers Storage and Network with the current one marked, on a storage path', () => {
      renderNav({}, '/sankey');
      const category = screen.getByRole('group', { name: 'Category' });
      expect(category).toBe(screen.getByTestId('nav-category'));
      expect(hrefsOf(category)).toEqual({ Storage: '/graph', Network: '/network/graph' });
      expect(within(category).getByRole('link', { name: 'Storage' })).toHaveAttribute('aria-current', 'true');
      expect(within(category).getByRole('link', { name: 'Network' })).not.toHaveAttribute('aria-current');
    });

    it('marks Network current on any /network path and links the category to its Graph without a query', () => {
      renderNav({}, '/network/sankey?hostname=sw-tor-1&from=now-1h&to=now');
      const category = screen.getByTestId('nav-category');
      expect(within(category).getByRole('link', { name: 'Network' })).toHaveAttribute('aria-current', 'true');
      expect(within(category).getByRole('link', { name: 'Storage' })).not.toHaveAttribute('aria-current');
      expect(hrefsOf(category)).toEqual({ Storage: '/graph', Network: '/network/graph' });
    });

    it('holds exactly one Graph / Sankey pair carrying the query inside the Network category', () => {
      renderNav({}, '/network/sankey?hostname=sw-tor-1&from=now-1h&to=now');
      const view = screen.getByRole('group', { name: 'View' });
      expect(within(view).getAllByRole('link')).toHaveLength(2);
      expect(screen.getAllByRole('link', { name: 'Graph' })).toHaveLength(1);
      expect(screen.getAllByRole('link', { name: 'Sankey' })).toHaveLength(1);
      expect(hrefsOf(view)).toEqual({
        Graph: '/network/graph?hostname=sw-tor-1&from=now-1h&to=now',
        Sankey: '/network/sankey?hostname=sw-tor-1&from=now-1h&to=now',
      });
      expect(within(view).getByRole('link', { name: 'Sankey' })).toHaveAttribute('aria-current', 'page');
      expect(within(view).getByRole('link', { name: 'Graph' })).not.toHaveAttribute('aria-current');
    });

    it('links the storage views without the query', () => {
      renderNav({}, '/sankey?az=zone-a&env=prod');
      const view = screen.getByTestId('nav-view');
      expect(within(view).getAllByRole('link')).toHaveLength(2);
      expect(hrefsOf(view)).toEqual({ Graph: '/graph', Sankey: '/sankey' });
      expect(within(view).getByRole('link', { name: 'Sankey' })).toHaveAttribute('aria-current', 'page');
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
