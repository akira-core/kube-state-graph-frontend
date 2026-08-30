import { isPlainObject } from '../../shared/guards/isPlainObject';

import { DEFAULT_RUNTIME_CONFIG, type ConfigTheme, type DefaultLayout, type RuntimeConfig } from './types';

export type ValidateOk = { ok: true; config: RuntimeConfig; warnings: string[] };
export type ValidateErr = { ok: false; error: string };
export type ValidateResult = ValidateOk | ValidateErr;

const KNOWN_ROOT_KEYS = new Set(['endpoints', 'demoMode', 'refreshIntervalSeconds', 'defaultLayout', 'theme']);

const KNOWN_ENDPOINT_KEYS = new Set(['graph', 'labelValues', 'edgeTypes', 'codeChanges', 'configChanges', 'dashboard']);

const LAYOUTS = new Set<DefaultLayout>(['fcose', 'dagre']);
const THEMES = new Set<ConfigTheme>(['dark', 'light', 'system']);

function fail(error: string): ValidateErr {
  return { ok: false, error };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// The WHATWG URL parser treats a backslash exactly like a slash for special schemes,
// so `/\evil.example/api` resolves to `http://evil.example/api` — an authority-form
// escape that a bare `//` check misses. Reject both spellings of the second separator.
function isRootRelative(value: string): boolean {
  return value.startsWith('/') && value[1] !== '/' && value[1] !== '\\';
}

export function describeEndpointUrlError(key: string): string {
  return `${key}: must be an absolute http(s) URL or a path starting with /`;
}

export function parseEndpointUrl(key: string, value: unknown): { ok: true; value: string | undefined } | ValidateErr {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return fail(`${key}: must be a string`);
  }
  if (value === '') {
    return { ok: true, value: undefined };
  }
  if (!isRootRelative(value) && !isHttpUrl(value)) {
    return fail(describeEndpointUrlError(key));
  }
  return { ok: true, value };
}

export function validateConfig(input: unknown): ValidateResult {
  if (!isPlainObject(input)) {
    return fail('root: must be a JSON object');
  }

  const warnings: string[] = [];
  for (const key of Object.keys(input)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      warnings.push(key);
    }
  }

  let demoMode = DEFAULT_RUNTIME_CONFIG.demoMode;
  if (Object.hasOwn(input, 'demoMode')) {
    if (typeof input.demoMode !== 'boolean') {
      return fail('demoMode: must be a boolean');
    }
    demoMode = input.demoMode;
  }

  let refreshIntervalSeconds = DEFAULT_RUNTIME_CONFIG.refreshIntervalSeconds;
  if (Object.hasOwn(input, 'refreshIntervalSeconds')) {
    const raw = input.refreshIntervalSeconds;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      return fail('refreshIntervalSeconds: must be an integer >= 0');
    }
    refreshIntervalSeconds = raw;
  }

  let defaultLayout = DEFAULT_RUNTIME_CONFIG.defaultLayout;
  if (Object.hasOwn(input, 'defaultLayout')) {
    const raw = input.defaultLayout;
    if (typeof raw !== 'string' || !LAYOUTS.has(raw as DefaultLayout)) {
      return fail('defaultLayout: must be "fcose" or "dagre"');
    }
    defaultLayout = raw as DefaultLayout;
  }

  let theme = DEFAULT_RUNTIME_CONFIG.theme;
  if (Object.hasOwn(input, 'theme')) {
    const raw = input.theme;
    if (typeof raw !== 'string' || !THEMES.has(raw as ConfigTheme)) {
      return fail('theme: must be "dark", "light", or "system"');
    }
    theme = raw as ConfigTheme;
  }

  const endpoints: RuntimeConfig['endpoints'] = {};

  if (!demoMode) {
    if (Object.hasOwn(input, 'endpoints')) {
      const raw = input.endpoints;
      if (!isPlainObject(raw)) {
        return fail('endpoints: must be an object');
      }
      for (const key of Object.keys(raw)) {
        if (!KNOWN_ENDPOINT_KEYS.has(key)) {
          warnings.push(`endpoints.${key}`);
        }
      }
      for (const key of ['graph', 'labelValues', 'edgeTypes', 'codeChanges', 'configChanges', 'dashboard'] as const) {
        if (!Object.hasOwn(raw, key)) {
          continue;
        }
        const parsed = parseEndpointUrl(`endpoints.${key}`, raw[key]);
        if (!parsed.ok) {
          return parsed;
        }
        if (parsed.value !== undefined) {
          endpoints[key] = parsed.value;
        }
      }
    }
    if (endpoints.graph === undefined) {
      return fail('endpoints.graph: required when demoMode is false');
    }
  }

  return {
    ok: true,
    config: { endpoints, demoMode, refreshIntervalSeconds, defaultLayout, theme },
    warnings,
  };
}

export function warnUnknownKeys(warnings: readonly string[], log: (msg: string) => void = console.warn): void {
  for (const key of warnings) {
    log(`Ignoring unknown config key: ${key}`);
  }
}
