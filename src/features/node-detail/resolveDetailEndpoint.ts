import type { RuntimeEndpoints } from '../runtime-config';

export interface ResolvedDetailEndpoints {
  codeChanges?: string;
  configChanges?: string;
  dashboard?: string;
}

/**
 * Endpoints come from runtime config. An unset (or empty) value means the
 * corresponding feature is unavailable — callers MUST NOT fetch it.
 */
export function resolveDetailEndpoints(endpoints: RuntimeEndpoints): ResolvedDetailEndpoints {
  const out: ResolvedDetailEndpoints = {};
  if (endpoints.codeChanges !== undefined && endpoints.codeChanges !== '') {
    out.codeChanges = endpoints.codeChanges;
  }
  if (endpoints.configChanges !== undefined && endpoints.configChanges !== '') {
    out.configChanges = endpoints.configChanges;
  }
  if (endpoints.dashboard !== undefined && endpoints.dashboard !== '') {
    out.dashboard = endpoints.dashboard;
  }
  return out;
}

export function isEndpointConfigured(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}
