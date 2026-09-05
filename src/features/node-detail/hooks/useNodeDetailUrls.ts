import { useEffect, useMemo, useRef, useState } from 'react';

import { isPlainObject } from '../../../shared/guards/isPlainObject';
import { fetchJson, withQuery } from '../../../shared/http/fetchJson';
import { resolveHttpUrl } from '../parseDashboardLinks';

export interface NodeDetailQueryInput {
  application: string;
  kind: string;
  name: string;
  time: number;
}

export interface ChangeReportDetail {
  url: string;
  currentTime?: string;
  previousTime?: string;
  resultType?: string;
}

export type DetailLookup =
  | { status: 'loading' }
  | { status: 'ready'; url: string; currentTime?: string; previousTime?: string; resultType?: string }
  | { status: 'unavailable'; error?: string };

const LOADING: DetailLookup = { status: 'loading' };
const UNAVAILABLE: DetailLookup = { status: 'unavailable' };

const EMPTY_BY_NAME: Record<string, DetailLookup> = Object.create(null) as Record<string, DetailLookup>;

export interface NodeDetailLookups {
  enabled: boolean;
  application: DetailLookup;
  containers: {
    phase: 'loading' | 'settled';
    byName: Record<string, DetailLookup>;
  };
}

export const IDLE_NODE_DETAIL_LOOKUPS: NodeDetailLookups = {
  enabled: false,
  application: UNAVAILABLE,
  containers: { phase: 'settled', byName: EMPTY_BY_NAME },
};

export interface DetailEndpoints {
  configChanges?: string;
  codeChanges?: string;
}

function requestKeyFor(endpoints: DetailEndpoints, input: NodeDetailQueryInput): string {
  return [
    endpoints.configChanges ?? '',
    endpoints.codeChanges ?? '',
    input.application,
    input.kind,
    input.name,
    String(input.time),
  ].join(' ');
}

function pickTimes(o: Record<string, unknown>): { currentTime?: string; previousTime?: string } {
  return {
    ...(typeof o.current_time === 'string' && o.current_time.length > 0 ? { currentTime: o.current_time } : {}),
    ...(typeof o.previous_time === 'string' && o.previous_time.length > 0 ? { previousTime: o.previous_time } : {}),
  };
}

function pickResultType(o: Record<string, unknown>): { resultType?: string } {
  return typeof o.result_type === 'string' && o.result_type.length > 0 ? { resultType: o.result_type } : {};
}

// Backend-supplied strings land straight in an anchor `href`, so they get the same
// http(s)-only gate the dashboard path applies (parseDashboardLinks): without it a
// `{"url":"javascript:…"}` response renders a clickable javascript: link.
function isRenderableUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length > 0 && resolveHttpUrl(url) !== undefined;
}

function parseApplicationUrl(res: unknown): ChangeReportDetail | undefined {
  if (isPlainObject(res) && isRenderableUrl(res.url)) {
    return { url: res.url, ...pickTimes(res) };
  }
  return undefined;
}

function parseUrlByContainer(res: unknown): Record<string, ChangeReportDetail> | undefined {
  if (!isPlainObject(res)) {
    return undefined;
  }
  const flat: Record<string, ChangeReportDetail> = Object.create(null) as Record<string, ChangeReportDetail>;
  for (const [container, entry] of Object.entries(res)) {
    if (isPlainObject(entry) && isRenderableUrl(entry.url)) {
      flat[container] = { url: entry.url, ...pickTimes(entry), ...pickResultType(entry) };
    }
  }
  return flat;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message;
  }
  return 'Not Found';
}

function queryFromInput(input: NodeDetailQueryInput): Record<string, string | number> {
  return { application: input.application, kind: input.kind, name: input.name, time: input.time };
}

function deriveApplication(
  appResult: { key: string; value: DetailLookup } | null,
  key: string,
  enabled: boolean
): DetailLookup {
  if (appResult !== null && appResult.key === key && enabled) {
    return appResult.value;
  }
  return enabled ? LOADING : UNAVAILABLE;
}

export function useNodeDetailUrls(
  input: NodeDetailQueryInput | undefined,
  endpoints: DetailEndpoints
): NodeDetailLookups {
  const configUrl = endpoints.configChanges?.trim().replace(/\/+$/, '') ?? '';
  const codeUrl = endpoints.codeChanges?.trim().replace(/\/+$/, '') ?? '';
  const enabled = input !== undefined && (configUrl !== '' || codeUrl !== '');
  const key =
    enabled && input !== undefined ? requestKeyFor({ configChanges: configUrl, codeChanges: codeUrl }, input) : '';

  const [appResult, setAppResult] = useState<{ key: string; value: DetailLookup } | null>(null);
  const [codeResult, setCodeResult] = useState<{
    key: string;
    map: Record<string, ChangeReportDetail> | null;
    failed: boolean;
  } | null>(null);

  const controllersRef = useRef<Set<AbortController>>(new Set());
  const argsRef = useRef<{ input: NodeDetailQueryInput | undefined; configUrl: string; codeUrl: string }>({
    input,
    configUrl,
    codeUrl,
  });
  useEffect(() => {
    argsRef.current = { input, configUrl, codeUrl };
  });

  useEffect(() => {
    const controllers = controllersRef.current;
    const cleanup = (): void => {
      for (const c of controllers) {
        c.abort();
      }
      controllers.clear();
    };
    if (key === '') {
      return cleanup;
    }
    const { input: liveInput, configUrl: liveConfig, codeUrl: liveCode } = argsRef.current;
    if (liveInput === undefined) {
      return cleanup;
    }
    const k = key;
    const params = queryFromInput(liveInput);

    if (liveConfig !== '') {
      const appController = new AbortController();
      controllers.add(appController);
      setAppResult({ key: k, value: LOADING });
      void fetchJson(withQuery(liveConfig, params), { signal: appController.signal })
        .then((res): ChangeReportDetail => {
          const parsed = parseApplicationUrl(res);
          if (parsed === undefined) {
            throw new Error('Not Found');
          }
          return parsed;
        })
        .then(
          (parsed) => {
            if (!appController.signal.aborted) {
              setAppResult({ key: k, value: { status: 'ready', ...parsed } });
            }
          },
          (reason: unknown) => {
            if (!appController.signal.aborted) {
              setAppResult({ key: k, value: { status: 'unavailable', error: errorMessage(reason) } });
            }
          }
        )
        .finally(() => controllers.delete(appController));
    } else {
      setAppResult({ key: k, value: UNAVAILABLE });
    }

    if (liveCode !== '') {
      const codeController = new AbortController();
      controllers.add(codeController);
      setCodeResult({ key: k, map: null, failed: false });
      void fetchJson(withQuery(liveCode, params), { signal: codeController.signal })
        .then((res): Record<string, ChangeReportDetail> => {
          const map = parseUrlByContainer(res);
          if (map === undefined) {
            throw new Error('Not Found');
          }
          return map;
        })
        .then(
          (map) => {
            if (!codeController.signal.aborted) {
              setCodeResult({ key: k, map, failed: false });
            }
          },
          () => {
            if (!codeController.signal.aborted) {
              setCodeResult({ key: k, map: null, failed: true });
            }
          }
        )
        .finally(() => controllers.delete(codeController));
    } else {
      setCodeResult({ key: k, map: null, failed: true });
    }

    return cleanup;
  }, [key]);

  const application = deriveApplication(appResult, key, enabled && configUrl !== '');

  const containers = useMemo<NodeDetailLookups['containers']>(() => {
    if (codeUrl === '' || !enabled) {
      return { phase: 'settled', byName: EMPTY_BY_NAME };
    }
    if (codeResult === null || codeResult.key !== key) {
      return { phase: 'loading', byName: EMPTY_BY_NAME };
    }
    if (codeResult.map === null) {
      return { phase: codeResult.failed ? 'settled' : 'loading', byName: EMPTY_BY_NAME };
    }
    const byName: Record<string, DetailLookup> = Object.create(null) as Record<string, DetailLookup>;
    for (const [name, detail] of Object.entries(codeResult.map)) {
      byName[name] = { status: 'ready', ...detail };
    }
    return { phase: 'settled', byName };
  }, [codeResult, key, enabled, codeUrl]);

  return { enabled, application, containers };
}
