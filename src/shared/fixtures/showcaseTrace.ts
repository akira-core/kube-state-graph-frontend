import type { WireGraph } from '../types/wire';

const G = (n: number): number => Math.round(n * 1e9);

/**
 * Showcase payload shaped as the trace endpoint's response: a destination trace from
 * `dist-a`'s uplink `et-0/0/48` (+40 Gbps in).
 *
 * Switch, k8s node, pod, application and namespace ids match `SHOWCASE_GRAPH` so a
 * demo-mode Locate lands on the Graph view's node. The body exercises every mark the
 * network Sankey draws:
 *   - `spine-a` / `spine-b` share `labels.tier: spine`, and `spine-b → spine-a` is a
 *     same-column interconnect (right-side arc);
 *   - `core → dist-a` runs against the majority direction (a backflow loop);
 *   - `dist-a` forwards less than it received: an "other out" residual;
 *   - `spine-a` and `spine-b` reach pods directly; `pod-node` placement edges put them on
 *     `worker-0` / `worker-1`, so the `Node` layout draws the two frames;
 *   - two neighbourless ports carry `clients`: one with a single owner (metered owner
 *     card) and one shared by two owners (ownership lines only).
 * Every hop balances: traced in + other in = traced out + other out.
 */
export const SHOWCASE_TRACE: WireGraph = {
  apiVersion: 'v1',
  clusters: ['prod'],
  elements: {
    nodes: [
      {
        data: {
          id: 'sw/dist-a',
          name: 'dist-a',
          type: 'switch',
          status: 'normal',
          labels: { level: '2', role: 'distribution' },
          investigation: {
            iface: 'et-0/0/48',
            delta_bps: G(40),
            direction: 'in',
            note: 'uplink from core-edge: +40 Gbps since 09:40',
          },
        },
      },
      {
        data: {
          id: 'sw/spine-a',
          name: 'spine-a',
          type: 'switch',
          status: 'normal',
          labels: { level: '3', role: 'spine', tier: 'spine' },
        },
      },
      {
        data: {
          id: 'sw/spine-b',
          name: 'spine-b',
          type: 'switch',
          status: 'warning',
          labels: { level: '3', role: 'spine', tier: 'spine' },
          alerts: [{ name: 'SwitchInterfaceErrors', severity: 'warning' }],
        },
      },
      { data: { id: 'sw/core', name: 'core', type: 'switch', status: 'normal', labels: { level: '4', role: 'core' } } },
      {
        data: {
          id: 'sw/core:et-1/0/9',
          type: 'host',
          name: 'storage gateways',
          clients: [
            { ip: '10.0.1.5', hostname: 'storage-gw-a', owner: 'Storage team' },
            { ip: '10.0.1.6', hostname: 'storage-gw-b', owner: 'Backup team' },
          ],
        },
      },
      {
        data: {
          id: 'sw/spine-b:xe-0/0/12',
          type: 'host',
          clients: [{ ip: '10.42.7.31', hostname: 'lab-gpu-01', owner: 'Platform team' }],
        },
      },
      { data: { id: 'cluster/prod', name: 'prod', type: 'cluster' } },
      { data: { id: 'prod/ns/prod', name: 'prod', type: 'namespace', parent: 'cluster/prod' } },
      { data: { id: 'prod/app/mongodb', name: 'mongodb', type: 'application', parent: 'prod/ns/prod' } },
      { data: { id: 'prod/app/gateway', name: 'gateway', type: 'application', parent: 'prod/ns/prod' } },
      { data: { id: 'node/worker-0', name: 'worker-0', type: 'node', status: 'normal', labels: { cluster: 'prod' } } },
      {
        data: {
          id: 'node/worker-1',
          name: 'worker-1',
          type: 'node',
          status: 'warning',
          labels: { cluster: 'prod' },
          alerts: [{ name: 'KubeNodeMemoryPressure', severity: 'warning' }],
        },
      },
      {
        data: {
          id: 'pod/mongo-0',
          name: 'mongo-0',
          type: 'pod',
          status: 'normal',
          parent: 'prod/app/mongodb',
          labels: { namespace: 'prod', cluster: 'prod', node: 'node/worker-0' },
        },
      },
      {
        data: {
          id: 'pod/gateway',
          name: 'gateway',
          type: 'pod',
          status: 'normal',
          parent: 'prod/app/gateway',
          labels: { namespace: 'prod', cluster: 'prod', node: 'node/worker-0' },
        },
      },
      {
        data: {
          id: 'pod/mongo-1',
          name: 'mongo-1',
          type: 'pod',
          status: 'warning',
          parent: 'prod/app/mongodb',
          labels: { namespace: 'prod', cluster: 'prod', node: 'node/worker-1' },
        },
      },
    ],
    edges: [
      {
        data: {
          id: 'tf-dist-a-spine-a',
          type: 'network-flow',
          source: 'sw/dist-a',
          target: 'sw/spine-a',
          labels: { source_iface: 'et-0/0/1', target_iface: 'et-0/0/17' },
          metrics: { delta_bps: G(24) },
        },
      },
      {
        data: {
          id: 'tf-dist-a-spine-b',
          type: 'network-flow',
          source: 'sw/dist-a',
          target: 'sw/spine-b',
          labels: { source_iface: 'et-0/0/2', target_iface: 'et-0/0/17' },
          metrics: { delta_bps: G(12) },
        },
      },
      {
        data: {
          id: 'tf-spine-b-spine-a',
          type: 'network-flow',
          source: 'sw/spine-b',
          target: 'sw/spine-a',
          labels: { source_iface: 'et-0/0/31', target_iface: 'et-0/0/31' },
          metrics: { delta_bps: G(3) },
        },
      },
      {
        data: {
          id: 'tf-spine-a-core',
          type: 'network-flow',
          source: 'sw/spine-a',
          target: 'sw/core',
          labels: { source_iface: 'et-0/0/48', target_iface: 'et-1/0/1' },
          metrics: { delta_bps: G(20) },
        },
      },
      {
        data: {
          id: 'tf-core-dist-a',
          type: 'network-flow',
          source: 'sw/core',
          target: 'sw/dist-a',
          labels: { source_iface: 'et-1/0/3', target_iface: 'et-0/0/47' },
          metrics: { delta_bps: G(1) },
        },
      },
      {
        data: {
          id: 'tf-core-storage',
          type: 'network-flow',
          source: 'sw/core',
          target: 'sw/core:et-1/0/9',
          labels: { source_iface: 'et-1/0/9' },
          metrics: { delta_bps: G(19) },
        },
      },
      {
        data: {
          id: 'tf-spine-a-mongo-0',
          type: 'network-flow',
          source: 'sw/spine-a',
          target: 'pod/mongo-0',
          labels: { source_iface: 'xe-0/0/3' },
          metrics: { delta_bps: G(4) },
        },
      },
      {
        data: {
          id: 'tf-spine-a-gateway',
          type: 'network-flow',
          source: 'sw/spine-a',
          target: 'pod/gateway',
          labels: { source_iface: 'xe-0/0/4' },
          metrics: { delta_bps: G(3) },
        },
      },
      {
        data: {
          id: 'tf-spine-b-mongo-1',
          type: 'network-flow',
          source: 'sw/spine-b',
          target: 'pod/mongo-1',
          labels: { source_iface: 'xe-0/0/5' },
          metrics: { delta_bps: G(5) },
        },
      },
      {
        data: {
          id: 'tf-spine-b-gpu',
          type: 'network-flow',
          source: 'sw/spine-b',
          target: 'sw/spine-b:xe-0/0/12',
          labels: { source_iface: 'xe-0/0/12' },
          metrics: { delta_bps: G(4) },
        },
      },
      {
        data: {
          id: 'tp-mongo-0',
          type: 'network-flow',
          source: 'pod/mongo-0',
          target: 'node/worker-0',
          labels: { tier: 'pod-node' },
        },
      },
      {
        data: {
          id: 'tp-gateway',
          type: 'network-flow',
          source: 'pod/gateway',
          target: 'node/worker-0',
          labels: { tier: 'pod-node' },
        },
      },
      {
        data: {
          id: 'tp-mongo-1',
          type: 'network-flow',
          source: 'pod/mongo-1',
          target: 'node/worker-1',
          labels: { tier: 'pod-node' },
        },
      },
    ],
  },
};
