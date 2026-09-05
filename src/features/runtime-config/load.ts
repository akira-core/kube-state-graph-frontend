import type { RuntimeConfig } from './types';
import { validateConfig, warnUnknownKeys, type ValidateResult } from './validate';

export function configPath(): string {
  const base = import.meta.env.BASE_URL;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}config.json`;
}

export type LoadConfigSuccess = { ok: true; path: string; config: RuntimeConfig };
export type LoadConfigFailure = { ok: false; path: string; problem: string };
export type LoadConfigResult = LoadConfigSuccess | LoadConfigFailure;

export async function loadRuntimeConfig(signal?: AbortSignal): Promise<LoadConfigResult> {
  const path = configPath();
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      cache: 'no-store',
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return { ok: false, path, problem: 'network error: failed to fetch config' };
  }
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, path, problem: `HTTP ${response.status}` };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, path, problem: 'JSON parse failed' };
  }
  const validated: ValidateResult = validateConfig(json);
  if (!validated.ok) {
    return { ok: false, path, problem: validated.error };
  }
  warnUnknownKeys(validated.warnings);
  return { ok: true, path, config: validated.config };
}
