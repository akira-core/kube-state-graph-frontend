import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('App bootstrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch backend endpoints before config loads', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('config.json')) {
        return new Promise<Response>(() => {
          /* hang */
        });
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(screen.getByTestId('config-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes('config.json'))).toBe(true);
  });

  it('shows the config error screen on 404 and does not render demo data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));
    render(<App />);
    expect(await screen.findByTestId('config-error-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
  });

  it('Retry re-fetches config.json', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          demoMode: true,
          refreshIntervalSeconds: 0,
          defaultLayout: 'fcose',
          theme: 'system',
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByTestId('config-error-screen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
