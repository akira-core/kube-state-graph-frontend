// The feature's public surface (what `network-trace/index.ts` re-exports); everything else
// is imported from its own file.
export { deriveTrace, directionFor } from './deriveTrace';
export type { TraceDirection, TraceGrouping, TraceModel, TraceModelOk } from './types';
