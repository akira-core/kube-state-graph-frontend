export class HttpStatusError extends Error {
  public constructor(
    public readonly url: string,
    public readonly status: number
  ) {
    super(`GET ${url} failed: ${status}`);
    this.name = 'HttpStatusError';
  }
}

export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new Error(`GET ${url} failed: network error`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new HttpStatusError(url, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`GET ${url} failed: JSON parse error`);
  }
}

export function withQuery(url: string, params: Record<string, string | string[] | number>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        qs.append(key, item);
      }
    } else {
      qs.set(key, String(value));
    }
  }
  const serialized = qs.toString();
  if (serialized === '') {
    return url;
  }
  return url.includes('?') ? `${url}&${serialized}` : `${url}?${serialized}`;
}
