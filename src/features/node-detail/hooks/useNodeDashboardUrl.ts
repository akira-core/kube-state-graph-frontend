import { useEffect, useRef, useState } from 'react';

import { fetchJson, withQuery } from '../../../shared/http/fetchJson';
import type { DashboardParams } from '../assembleDashboardParams';
import { parseDashboardLinks, type DashboardLink } from '../parseDashboardLinks';

export type DashboardLookup =
  { status: 'loading' } | { status: 'ready'; urls: readonly DashboardLink[] } | { status: 'unavailable' };

const LOADING: DashboardLookup = { status: 'loading' };
const UNAVAILABLE: DashboardLookup = { status: 'unavailable' };

function serializeParams(base: string, params: DashboardParams): string {
  const body = Object.keys(params)
    .sort()
    .map((k) => {
      const v = params[k];
      return `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`;
    })
    .join('&');
  return `${base}|${body}`;
}

export function useNodeDashboardUrl(
  params: DashboardParams | undefined,
  endpoint: string | undefined
): DashboardLookup {
  // Used VERBATIM, per the runtime-config contract: an operator's URL is the URL. Stripping
  // a trailing slash rewrites the request — `/dashboard/` and `/dashboard` are different
  // routes on plenty of backends — and silently overriding a deployment's configuration is
  // worse than the mismatch it papers over. Whitespace is likewise the validator's problem.
  const base = endpoint ?? '';
  const enabled = params !== undefined && base !== '';
  const key = enabled && params !== undefined ? serializeParams(base, params) : '';

  const [result, setResult] = useState<{ key: string; value: DashboardLookup } | null>(null);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const argsRef = useRef<{ params: DashboardParams | undefined; base: string }>({ params, base });
  useEffect(() => {
    argsRef.current = { params, base };
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
    const { params: liveParams, base: liveBase } = argsRef.current;
    if (liveParams === undefined) {
      return cleanup;
    }
    const k = key;
    const controller = new AbortController();
    controllers.add(controller);
    setResult({ key: k, value: LOADING });
    void fetchJson(withQuery(liveBase, liveParams), { signal: controller.signal })
      .then((res): DashboardLink[] => {
        const urls = parseDashboardLinks(res);
        if (urls === undefined) {
          throw new Error('Not Found');
        }
        return urls;
      })
      .then(
        (urls) => {
          if (!controller.signal.aborted) {
            setResult({ key: k, value: { status: 'ready', urls } });
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setResult({ key: k, value: UNAVAILABLE });
          }
        }
      )
      .finally(() => controllers.delete(controller));

    return cleanup;
  }, [key]);

  if (!enabled) {
    return UNAVAILABLE;
  }
  return result !== null && result.key === key ? result.value : LOADING;
}
