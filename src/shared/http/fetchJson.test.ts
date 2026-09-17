import { HttpStatusError, fetchJson, withQuery } from './fetchJson';

/** A `fetch` that answers once with the given status and body. */
function stubFetch(status: number, body: string, contentType = 'application/json'): typeof globalThis.fetch {
  return vi.fn(() => Promise.resolve(new Response(body, { status, headers: { 'Content-Type': contentType } })));
}

describe('fetchJson error reporting', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('carries a refusal reason verbatim into the message', async () => {
    globalThis.fetch = stubFetch(400, JSON.stringify({ reason: 'unknown hostname "sw-nope"' }));
    const err = await fetchJson('/v1/trace').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(400);
    expect((err as HttpStatusError).reason).toBe('unknown hostname "sw-nope"');
    expect((err as HttpStatusError).message).toBe('GET /v1/trace failed: 400 — unknown hostname "sw-nope"');
  });

  it('leaves the status message alone when the body names no reason', async () => {
    globalThis.fetch = stubFetch(500, JSON.stringify({ error: 'boom' }));
    const err = await fetchJson('/v1/graph').catch((e: unknown) => e);
    expect((err as HttpStatusError).reason).toBeUndefined();
    expect((err as HttpStatusError).message).toBe('GET /v1/graph failed: 500');
  });

  it('survives a refusal whose body is not JSON', async () => {
    globalThis.fetch = stubFetch(502, '<html>nginx</html>', 'text/html');
    const err = await fetchJson('/v1/graph').catch((e: unknown) => e);
    expect((err as HttpStatusError).message).toBe('GET /v1/graph failed: 502');
  });

  it('caps a very long reason rather than pasting a page into the error state', async () => {
    globalThis.fetch = stubFetch(400, JSON.stringify({ reason: 'x'.repeat(500) }));
    const err = await fetchJson('/v1/trace').catch((e: unknown) => e);
    const reason = (err as HttpStatusError).reason ?? '';
    expect(reason).toHaveLength(301);
    expect(reason.endsWith('…')).toBe(true);
  });
});

describe('withQuery', () => {
  it('returns the url unchanged when there is nothing to append', () => {
    expect(withQuery('/v1/graph', {})).toBe('/v1/graph');
  });

  it('appends a query to a bare url', () => {
    expect(withQuery('/v1/graph', { start: 1, end: 2 })).toBe('/v1/graph?start=1&end=2');
  });

  it('repeats a key for each array member', () => {
    expect(withQuery('/v1/graph', { cluster: ['a', 'b'] })).toBe('/v1/graph?cluster=a&cluster=b');
  });

  it('keeps an existing query that does not collide, verbatim', () => {
    expect(withQuery('https://ksg.example/v1/graph?tenant=ops', { start: 1 })).toBe(
      'https://ksg.example/v1/graph?tenant=ops&start=1'
    );
  });

  it('replaces a same-name key already present on the configured endpoint', () => {
    // `start=old&start=new` is not an override: the Go backend reads Query().Get("start"),
    // which takes the FIRST value, so the stale window would win every refresh.
    expect(withQuery('/v1/graph?start=100&end=200', { start: 300, end: 400 })).toBe('/v1/graph?start=300&end=400');
  });

  it('replaces every occurrence of a colliding repeated key', () => {
    expect(withQuery('/v1/graph?cluster=old-a&cluster=old-b&tenant=ops', { cluster: ['new'] })).toBe(
      '/v1/graph?tenant=ops&cluster=new'
    );
  });

  it('leaves an unrelated encoded pair untouched', () => {
    expect(withQuery('/v1/graph?note=a%20b', { start: 1 })).toBe('/v1/graph?note=a%20b&start=1');
  });

  it('drops an empty query marker rather than emitting a bare ?', () => {
    expect(withQuery('/v1/graph?', {})).toBe('/v1/graph');
  });
});
