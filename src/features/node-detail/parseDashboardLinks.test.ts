import { parseDashboardLinks } from './parseDashboardLinks';

describe('parseDashboardLinks', () => {
  it('parses legacy { url } as a single Dashboard link', () => {
    expect(parseDashboardLinks({ url: 'https://grafana/d/abc' })).toEqual([
      { label: 'Dashboard', url: 'https://grafana/d/abc' },
    ]);
  });

  it('parses { urls } with labels', () => {
    expect(
      parseDashboardLinks({
        urls: [
          { label: 'Metrics', url: 'https://grafana/d/metrics' },
          { label: 'Logs', url: 'https://grafana/d/logs' },
        ],
      })
    ).toEqual([
      { label: 'Metrics', url: 'https://grafana/d/metrics' },
      { label: 'Logs', url: 'https://grafana/d/logs' },
    ]);
  });

  it('prefers non-empty urls over legacy url', () => {
    expect(
      parseDashboardLinks({
        url: 'https://legacy',
        urls: [{ label: 'New', url: 'https://new' }],
      })
    ).toEqual([{ label: 'New', url: 'https://new' }]);
  });

  it('falls back to legacy url when urls is empty', () => {
    expect(parseDashboardLinks({ url: 'https://legacy', urls: [] })).toEqual([
      { label: 'Dashboard', url: 'https://legacy' },
    ]);
  });

  it('filters invalid url entries and keeps valid ones', () => {
    expect(
      parseDashboardLinks({
        urls: [{ label: 'Ok', url: 'https://ok' }, { url: '' }, null, { label: 'Also', url: 'https://also' }],
      })
    ).toEqual([
      { label: 'Ok', url: 'https://ok' },
      { label: 'Also', url: 'https://also' },
    ]);
  });

  it('derives label from URL pathname when label is missing', () => {
    expect(parseDashboardLinks({ urls: [{ url: 'https://grafana/d/node-metrics' }] })).toEqual([
      { label: 'node-metrics', url: 'https://grafana/d/node-metrics' },
    ]);
  });

  it('derives label from a relative Grafana URL path (resolved against origin)', () => {
    expect(parseDashboardLinks({ urls: [{ url: '/d/uid/node-metrics' }] })).toEqual([
      { label: 'node-metrics', url: '/d/uid/node-metrics' },
    ]);
  });

  it('uses Dashboard / Dashboard N when label and pathname are unusable', () => {
    // Empty-pathname URLs yield no path segment, so the numeric fallback applies.
    expect(
      parseDashboardLinks({
        urls: [{ url: 'https://grafana' }, { url: 'https://grafana.test' }],
      })
    ).toEqual([
      { label: 'Dashboard', url: 'https://grafana' },
      { label: 'Dashboard 2', url: 'https://grafana.test' },
    ]);
  });

  it('numbers fallback labels by display position, not raw input index', () => {
    // A leading invalid entry must not push the first valid link to "Dashboard 2".
    expect(parseDashboardLinks({ urls: [null, { url: 'https://grafana' }] })).toEqual([
      { label: 'Dashboard', url: 'https://grafana' },
    ]);
    // A dropped middle entry must not leave a numbering gap.
    expect(parseDashboardLinks({ urls: [{ url: 'https://a' }, { url: '' }, { url: 'https://b' }] })).toEqual([
      { label: 'Dashboard', url: 'https://a' },
      { label: 'Dashboard 2', url: 'https://b' },
    ]);
  });

  it('disambiguates duplicate derived labels', () => {
    expect(
      parseDashboardLinks({
        urls: [{ url: 'https://a/d/x/metrics' }, { url: 'https://b/d/y/metrics' }],
      })
    ).toEqual([
      { label: 'metrics', url: 'https://a/d/x/metrics' },
      { label: 'metrics (2)', url: 'https://b/d/y/metrics' },
    ]);
  });

  it('drops non-http(s) urls (javascript:, data:) from the links array', () => {
    expect(
      parseDashboardLinks({
        urls: [
          { label: 'Evil', url: 'javascript:alert(1)' },
          { label: 'Ok', url: 'https://ok' },
          { label: 'Data', url: 'data:text/html,x' },
        ],
      })
    ).toEqual([{ label: 'Ok', url: 'https://ok' }]);
  });

  it('treats a legacy non-http(s) url as unavailable', () => {
    expect(parseDashboardLinks({ url: 'javascript:alert(1)' })).toBeUndefined();
  });

  it('returns undefined for empty url, empty urls, or non-objects', () => {
    expect(parseDashboardLinks({ url: '' })).toBeUndefined();
    expect(parseDashboardLinks({ urls: [] })).toBeUndefined();
    expect(parseDashboardLinks(null)).toBeUndefined();
    expect(parseDashboardLinks('bad')).toBeUndefined();
  });
});
