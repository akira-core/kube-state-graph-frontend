import { resolveDetailEndpoints, isEndpointConfigured } from './resolveDetailEndpoint';

describe('resolveDetailEndpoints', () => {
  it('returns nothing and treats empty strings as absent', () => {
    expect(resolveDetailEndpoints({})).toEqual({});
    expect(resolveDetailEndpoints({ codeChanges: '', dashboard: '' })).toEqual({});
    expect(isEndpointConfigured(undefined)).toBe(false);
    expect(isEndpointConfigured('')).toBe(false);
  });

  it('passes through independently configured URLs', () => {
    expect(
      resolveDetailEndpoints({
        graph: '/api/v1/graph',
        codeChanges: '/api/v1/graph/code_changes',
        dashboard: 'https://ksg.example/dashboard',
      })
    ).toEqual({
      codeChanges: '/api/v1/graph/code_changes',
      dashboard: 'https://ksg.example/dashboard',
    });
  });
});
