import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateConfig, warnUnknownKeys } from './validate';

describe('validateConfig', () => {
  it('accepts the minimal valid non-demo config and applies defaults', () => {
    const result = validateConfig({ endpoints: { graph: 'https://ksg.example/v1/graph' } });
    expect(result).toEqual({
      ok: true,
      warnings: [],
      config: {
        endpoints: { graph: 'https://ksg.example/v1/graph' },
        demoMode: false,
        refreshIntervalSeconds: 0,
        defaultLayout: 'fcose',
        theme: 'system',
      },
    });
  });

  it('rejects a non-object root', () => {
    expect(validateConfig([]).ok).toBe(false);
    expect(validateConfig('x').ok).toBe(false);
  });

  it('rejects typed-wrong and out-of-range fields without coercing', () => {
    expect(validateConfig({ refreshIntervalSeconds: '30' }).ok).toBe(false);
    expect(validateConfig({ refreshIntervalSeconds: 1.5 }).ok).toBe(false);
    expect(validateConfig({ refreshIntervalSeconds: -1 }).ok).toBe(false);
    expect(validateConfig({ demoMode: 'true' }).ok).toBe(false);
    expect(validateConfig({ endpoints: 'https://ksg.example' }).ok).toBe(false);
    expect(validateConfig({ theme: null }).ok).toBe(false);
  });

  it('rejects illegal enum values case-sensitively', () => {
    expect(validateConfig({ defaultLayout: 'cola' }).ok).toBe(false);
    expect(validateConfig({ theme: 'auto' }).ok).toBe(false);
    expect(validateConfig({ theme: 'Dark' }).ok).toBe(false);
  });

  it('accepts an absolute https graph URL', () => {
    const result = validateConfig({ endpoints: { graph: 'https://ksg.example/v1/graph' } });
    expect(result.ok).toBe(true);
  });

  it('accepts a root-relative graph URL', () => {
    const result = validateConfig({ endpoints: { graph: '/api/v1/graph' } });
    expect(result.ok && result.config.endpoints.graph).toBe('/api/v1/graph');
  });

  it('rejects a relative path without a leading slash', () => {
    const result = validateConfig({ demoMode: false, endpoints: { dashboard: 'api/dashboard' } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('endpoints.dashboard');
    }
  });

  it('rejects non-http(s) schemes and protocol-relative URLs', () => {
    expect(validateConfig({ endpoints: { graph: 'ftp://ksg.example/v1/graph' } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: 'javascript:alert(1)' } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: '//ksg.example/v1/graph' } }).ok).toBe(false);
  });

  it('rejects non-string endpoint values', () => {
    expect(validateConfig({ endpoints: { graph: 1 } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: {} } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: [] } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: null } }).ok).toBe(false);
  });

  it('treats empty string optional endpoints as absent, and empty graph as missing', () => {
    const optional = validateConfig({
      endpoints: { graph: 'https://ksg.example/v1/graph', dashboard: '' },
    });
    expect(optional.ok && optional.config.endpoints.dashboard).toBeUndefined();

    const missingGraph = validateConfig({ endpoints: { graph: '' } });
    expect(missingGraph.ok).toBe(false);
  });

  it('treats a missing storageGraph as absent, not a config error', () => {
    const result = validateConfig({ endpoints: { graph: 'https://ksg.example/v1/graph' } });
    expect(result.ok).toBe(true);
    expect(result.ok && result.config.endpoints.storageGraph).toBeUndefined();
  });

  it('treats an empty storageGraph as absent, not a config error', () => {
    const result = validateConfig({
      endpoints: { graph: 'https://ksg.example/v1/graph', storageGraph: '' },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.config.endpoints.storageGraph).toBeUndefined();
  });

  it('accepts an absolute or root-relative storageGraph URL', () => {
    const abs = validateConfig({
      endpoints: { graph: '/api/v1/graph', storageGraph: 'https://ksg.example/v1/storage-graph' },
    });
    expect(abs.ok && abs.config.endpoints.storageGraph).toBe('https://ksg.example/v1/storage-graph');

    const rel = validateConfig({
      endpoints: { graph: '/api/v1/graph', storageGraph: '/api/v1/storage-graph' },
    });
    expect(rel.ok && rel.config.endpoints.storageGraph).toBe('/api/v1/storage-graph');
  });

  it('rejects a non-http(s) or non-string storageGraph', () => {
    expect(
      validateConfig({ endpoints: { graph: '/api/v1/graph', storageGraph: 'ftp://ksg.example/v1/storage-graph' } }).ok
    ).toBe(false);
    expect(validateConfig({ endpoints: { graph: '/api/v1/graph', storageGraph: '//ksg.example/sg' } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: '/api/v1/graph', storageGraph: 1 } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: '/api/v1/graph', storageGraph: null } }).ok).toBe(false);
  });

  it('does not warn about storageGraph as an unknown endpoint key', () => {
    const result = validateConfig({
      endpoints: { graph: '/api/v1/graph', storageGraph: '/api/v1/storage-graph' },
    });
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('accepts a root-relative label-values base', () => {
    const result = validateConfig({
      endpoints: { graph: '/api/v1/graph', labelValues: '/metrics-api' },
    });
    expect(result.ok && result.config.endpoints.labelValues).toBe('/metrics-api');
  });

  it('accepts an absolute http(s) label-values base', () => {
    const result = validateConfig({
      endpoints: { graph: '/api/v1/graph', labelValues: 'https://vm.example/prometheus' },
    });
    expect(result.ok && result.config.endpoints.labelValues).toBe('https://vm.example/prometheus');
  });

  it('rejects a non-string or non-URL label-values base', () => {
    expect(validateConfig({ endpoints: { graph: '/api/v1/graph', labelValues: 1 } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: '/api/v1/graph', labelValues: '//vm.example' } }).ok).toBe(false);
    expect(validateConfig({ endpoints: { graph: '/api/v1/graph', labelValues: 'ftp://vm.example' } }).ok).toBe(false);
  });

  it('treats labelValues as optional — the controls degrade, the graph still loads', () => {
    const result = validateConfig({ endpoints: { graph: '/api/v1/graph' } });
    expect(result.ok).toBe(true);
    expect(result.ok && result.config.endpoints.labelValues).toBeUndefined();
  });

  it('accepts the edge-type catalogue endpoint', () => {
    const result = validateConfig({ endpoints: { graph: '/api/v1/graph', edgeTypes: '/api/v1/edge-types' } });
    expect(result.ok && result.config.endpoints.edgeTypes).toBe('/api/v1/edge-types');
  });

  it('does not warn about labelValues or edgeTypes as unknown endpoint keys', () => {
    const result = validateConfig({
      endpoints: { graph: '/api/v1/graph', labelValues: '/metrics-api', edgeTypes: '/api/v1/edge-types' },
    });
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('requires endpoints.graph when demoMode is false', () => {
    const result = validateConfig({ theme: 'dark' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('endpoints.graph');
    }
  });

  it('allows missing graph when demoMode is true', () => {
    const result = validateConfig({ demoMode: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.demoMode).toBe(true);
      expect(result.config.endpoints).toEqual({});
    }
  });

  it('ignores illegal endpoints entirely in demo mode', () => {
    const result = validateConfig({ demoMode: true, endpoints: { graph: 'not a url' } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.endpoints).toEqual({});
    }
  });

  it('still validates other fields in demo mode', () => {
    const result = validateConfig({ demoMode: true, theme: 'blue' });
    expect(result.ok).toBe(false);
  });

  it('reports only the first validation problem', () => {
    const result = validateConfig({ refreshIntervalSeconds: -1, theme: 'auto' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('refreshIntervalSeconds');
      expect(result.error).not.toContain('theme');
    }
  });

  it('ignores unknown keys and records warnings', () => {
    const result = validateConfig({
      endpoints: { graph: '/api/v1/graph', metrics: '/api/metrics' },
      title: 'Prod',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual(expect.arrayContaining(['title', 'endpoints.metrics']));
    }
  });
});

describe('warnUnknownKeys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a console warning naming each ignored key', () => {
    const log = vi.fn();
    warnUnknownKeys(['title', 'endpoints.metrics'], log);
    expect(log).toHaveBeenCalledWith('Ignoring unknown config key: title');
    expect(log).toHaveBeenCalledWith('Ignoring unknown config key: endpoints.metrics');
  });
});
