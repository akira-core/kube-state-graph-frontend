import { withQuery } from './fetchJson';

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
