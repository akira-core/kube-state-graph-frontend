import type { WireGraph } from '../types/wire';

/**
 * The Network category demo body (`GET /v1/trace` shape), merged from the network samples of
 * the sankey-panel repo (`samples/*.json`) so one drawing carries all of their cases. Node
 * and edge ids are prefixed with the sample key (`client/sw-tor-1`); a node the sample left
 * unnamed is named by its bare id, so cards read as they did there.
 *
 * - **Backbone and trace start — `dci-uturn`**: `core-1` (+24 Gbps in) → border → DCI /
 *   spine → ToR, tier-locked, with DCI traffic turning back to the border (backflow). Its
 *   `tor-1` and `tor-2` no longer end at plain servers:
 *   - `tor-1` feeds **`k8s`**: ToR → k8s node (one with an explicit `other_out_bps`) →
 *     pods → namespace cards, plus a host port;
 *   - `tor-2` feeds **`client`**: neighbourless ports with client tables, single-owner
 *     (metered) and mixed / unknown-owner (ownership line) ports, a named port, a warning
 *     status, an owner spanning several ports.
 *
 *   Both stitched ToRs receive less than they forward, so they show "other in".
 * - **Islands** drawn beside the backbone: `classic` (non-conserving hop), `dual-uplink`
 *   (parallel links between one pair; two measurements of one key summed), `campus` (every
 *   layer with untraced uplinks and exits; a router leaf reached from two hops), `pruned`
 *   (explicit `other_out_bps` for truncated ports), `dci-tier` (same-tier interconnect
 *   chain) and `k8s-source` (pods → node → ToR, drawn as upstream feeders). A body carries
 *   one trace start, so each island start holds what its sample fed it through the anchor
 *   ribbon as an explicit `other_in_bps` (`other_out_bps` for `k8s-source`, a source trace),
 *   and every hop balances.
 *
 * Not included: `source` (its servers send into the switches, and a trace-stop leaf with an
 * onward edge is invalid in a destination trace) and `storage` (storage-flow edges).
 *
 * `public/demo/trace.json` is this body serialized by `npm run fixture:build`.
 */
export const SHOWCASE_TRACE: WireGraph = {
  elements: {
    nodes: [
      {
        data: {
          id: 'dci-uturn/core-1',
          type: 'switch',
          name: 'Core 1',
          investigation: {
            iface: 'et-0/0/0',
            delta_bps: 24000000000,
            direction: 'in',
            note: 'core 進來 +24 Gbps，部分流量經 dci 繞回 bdr 再下去',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/bdr-1',
          type: 'switch',
          name: 'BDR 1',
          labels: {
            tier: 'bdr',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/bdr-2',
          type: 'switch',
          name: 'BDR 2',
          labels: {
            tier: 'bdr',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/bdr-3',
          type: 'switch',
          name: 'BDR 3',
          labels: {
            tier: 'bdr',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/bdr-4',
          type: 'switch',
          name: 'BDR 4',
          labels: {
            tier: 'bdr',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/bdr-5',
          type: 'switch',
          name: 'BDR 5',
          labels: {
            tier: 'bdr',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/bdr-6',
          type: 'switch',
          name: 'BDR 6',
          labels: {
            tier: 'bdr',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/dci-1',
          type: 'switch',
          name: 'DCI 1',
          labels: {
            tier: 'dci-spn',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/dci-2',
          type: 'switch',
          name: 'DCI 2',
          labels: {
            tier: 'dci-spn',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/dci-3',
          type: 'switch',
          name: 'DCI 3',
          labels: {
            tier: 'dci-spn',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/spn-1',
          type: 'switch',
          name: 'SPN 1',
          labels: {
            tier: 'dci-spn',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/spn-2',
          type: 'switch',
          name: 'SPN 2',
          labels: {
            tier: 'dci-spn',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/spn-3',
          type: 'switch',
          name: 'SPN 3',
          labels: {
            tier: 'dci-spn',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/tor-1',
          type: 'switch',
          name: 'ToR 1',
          labels: {
            tier: 'tor',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/tor-2',
          type: 'switch',
          name: 'ToR 2',
          labels: {
            tier: 'tor',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/tor-3',
          type: 'switch',
          name: 'ToR 3',
          labels: {
            tier: 'tor',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/tor-4',
          type: 'switch',
          name: 'ToR 4',
          labels: {
            tier: 'tor',
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/srv-3',
          type: 'host',
          name: 'srv-3',
        },
      },
      {
        data: {
          id: 'dci-uturn/srv-4',
          type: 'host',
          name: 'srv-4',
        },
      },
      {
        data: {
          id: 'k8s/sw-tor-k8s',
          type: 'switch',
          name: 'ToR k8s (k8s)',
        },
      },
      {
        data: {
          id: 'k8s/node-w-11',
          type: 'node',
          name: 'node-w-11',
          other_out_bps: 2500000000,
        },
      },
      {
        data: {
          id: 'k8s/node-w-12',
          type: 'node',
          name: 'node-w-12',
        },
      },
      {
        data: {
          id: 'k8s/node-w-13',
          type: 'node',
          name: 'node-w-13',
        },
      },
      {
        data: {
          id: 'k8s/srv-log-01',
          type: 'host',
          name: 'srv-log-01 (k8s)',
        },
      },
      {
        data: {
          id: 'k8s/ingest-7d9c',
          type: 'pod',
          labels: {
            namespace: 'telemetry',
          },
          name: 'ingest-7d9c',
        },
      },
      {
        data: {
          id: 'k8s/kafka-2',
          type: 'pod',
          labels: {
            namespace: 'stream',
          },
          name: 'kafka-2',
        },
      },
      {
        data: {
          id: 'k8s/ingest-4f11',
          type: 'pod',
          labels: {
            namespace: 'telemetry',
          },
          name: 'ingest-4f11',
        },
      },
      {
        data: {
          id: 'k8s/debug-shell',
          type: 'pod',
          labels: {
            namespace: 'debug',
          },
          name: 'debug-shell',
        },
      },
      {
        data: {
          id: 'client/sw-tor-1',
          type: 'switch',
          name: 'ToR 1 (client)',
        },
      },
      {
        data: {
          id: 'client/sw-tor-1:xe-0/0/12',
          type: 'host',
          clients: [
            {
              ip: '10.42.7.31',
              hostname: 'lab-gpu-01',
              owner: '網管部 王小明',
            },
          ],
        },
      },
      {
        data: {
          id: 'client/sw-tor-1:xe-0/0/13',
          type: 'host',
          labels: {
            namespace: 'lab',
          },
          clients: [
            {
              ip: '10.42.7.32',
            },
          ],
        },
      },
      {
        data: {
          id: 'client/sw-tor-1:xe-0/0/14',
          type: 'host',
          name: '未管理小 switch',
          clients: [
            {
              ip: '10.42.7.41',
              hostname: 'ipphone-3f-07',
              owner: '總務處 李美華',
            },
            {
              ip: '10.42.7.42',
              hostname: 'desk-pc-3f-07',
            },
            {
              hostname: 'desk-nas-3f-07',
              owner: '總務處 李美華',
            },
            {
              owner: '沒有 ip 也沒有 hostname，這筆會被靜默丟棄',
            },
          ],
        },
      },
      {
        data: {
          id: 'client/sw-tor-1:xe-0/0/15',
          type: 'host',
          status: 'warning',
          clients: [
            {
              ip: '10.42.7.51',
              hostname: 'lab-workstation-rendering-farm-node-42.corp.example.internal',
              owner: '研究發展二部 平台工程組 陳大文（分機 4721）',
            },
          ],
        },
      },
      {
        data: {
          id: 'client/sw-tor-1:xe-0/0/17',
          type: 'host',
          clients: [
            {
              ip: '10.42.9.11',
              hostname: 'wsA-3f-01',
              owner: '設計部 張三',
            },
            {
              ip: '10.42.9.12',
              hostname: 'wsA-3f-02',
              owner: '設計部 李四',
            },
            {
              ip: '10.42.9.13',
              hostname: 'wsA-3f-03',
            },
            {
              ip: '10.42.9.14',
            },
            {
              hostname: 'printer-3f',
              owner: '總務處 李美華',
            },
            {
              ip: '10.42.9.16',
              hostname: 'ap-3f-north',
              owner: '網管部 王小明',
            },
          ],
        },
      },
      {
        data: {
          id: 'client/sw-tor-1:xe-0/0/18',
          type: 'host',
          clients: [
            {
              ip: '10.42.9.21',
              hostname: 'cam-lobby-01',
            },
            {
              ip: '10.42.9.22',
              hostname: 'cam-lobby-02',
            },
          ],
        },
      },
      {
        data: {
          id: 'client/srv-legacy-09',
          type: 'host',
          name: 'srv-legacy-09',
        },
      },
      {
        data: {
          id: 'classic/sw-edge-a',
          type: 'switch',
          name: 'Edge A (classic)',
          other_in_bps: 20000000000,
        },
      },
      {
        data: {
          id: 'classic/sw-core-1',
          type: 'switch',
          name: 'Core 1 (classic)',
        },
      },
      {
        data: {
          id: 'classic/srv-db-07',
          type: 'host',
          name: 'srv-db-07',
        },
      },
      {
        data: {
          id: 'dual-uplink/sw-edge-a',
          type: 'switch',
          name: 'Edge A (dual-uplink)',
          other_in_bps: 10000000000,
        },
      },
      {
        data: {
          id: 'dual-uplink/sw-core-1',
          type: 'switch',
          name: 'Core 1 (dual-uplink)',
        },
      },
      {
        data: {
          id: 'dual-uplink/sw-agg-9',
          type: 'switch',
          name: 'Agg 9',
        },
      },
      {
        data: {
          id: 'dual-uplink/srv-cache-02',
          type: 'host',
          name: 'srv-cache-02',
        },
      },
      {
        data: {
          id: 'dual-uplink/srv-cache-03',
          type: 'host',
          name: 'srv-cache-03',
        },
      },
      {
        data: {
          id: 'campus/sw-dorm-b3',
          type: 'switch',
          name: '宿網 B3',
          other_in_bps: 22000000000,
        },
      },
      {
        data: {
          id: 'campus/sw-agg-dorm',
          type: 'switch',
          name: '宿區匯聚',
        },
      },
      {
        data: {
          id: 'campus/sw-core-n',
          type: 'switch',
          name: '核心 North',
        },
      },
      {
        data: {
          id: 'campus/fw-campus',
          type: 'switch',
          name: '校園防火牆',
        },
      },
      {
        data: {
          id: 'campus/sw-dc-spine',
          type: 'switch',
          name: '機房 Spine',
        },
      },
      {
        data: {
          id: 'campus/rtr-tanet',
          type: 'router',
          name: 'rtr-tanet',
        },
      },
      {
        data: {
          id: 'campus/srv-nas-01',
          type: 'host',
          name: 'srv-nas-01',
        },
      },
      {
        data: {
          id: 'pruned/sw-tor-14',
          type: 'switch',
          name: 'ToR 14',
          other_out_bps: 9000000000,
          other_in_bps: 42000000000,
        },
      },
      {
        data: {
          id: 'pruned/sw-leaf-3',
          type: 'switch',
          name: 'Leaf 3',
          other_out_bps: 3000000000,
        },
      },
      {
        data: {
          id: 'pruned/srv-app-11',
          type: 'host',
          name: 'srv-app-11',
        },
      },
      {
        data: {
          id: 'pruned/srv-app-12',
          type: 'host',
          name: 'srv-app-12',
        },
      },
      {
        data: {
          id: 'pruned/srv-log-01',
          type: 'host',
          name: 'srv-log-01 (pruned)',
        },
      },
      {
        data: {
          id: 'pruned/srv-log-02',
          type: 'host',
          name: 'srv-log-02',
        },
      },
      {
        data: {
          id: 'dci-tier/core-1',
          type: 'switch',
          name: 'Core',
          other_in_bps: 24000000000,
        },
      },
      {
        data: {
          id: 'dci-tier/bdr-1',
          type: 'switch',
          name: 'BDR 1 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/bdr-2',
          type: 'switch',
          name: 'BDR 2 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/bdr-3',
          type: 'switch',
          name: 'BDR 3 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/dci-1',
          type: 'switch',
          name: 'DCI 1 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/dci-2',
          type: 'switch',
          name: 'DCI 2 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/bdr-4',
          type: 'switch',
          name: 'BDR 4 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/bdr-5',
          type: 'switch',
          name: 'BDR 5 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/bdr-6',
          type: 'switch',
          name: 'BDR 6 (dci-tier)',
          labels: {
            tier: 'border',
          },
        },
      },
      {
        data: {
          id: 'dci-tier/spn-1',
          type: 'switch',
          name: 'SPN 1 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/spn-2',
          type: 'switch',
          name: 'SPN 2 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/spn-3',
          type: 'switch',
          name: 'SPN 3 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/tor-1',
          type: 'switch',
          name: 'ToR 1 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/tor-2',
          type: 'switch',
          name: 'ToR 2 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/tor-3',
          type: 'switch',
          name: 'ToR 3 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/tor-4',
          type: 'switch',
          name: 'ToR 4 (dci-tier)',
        },
      },
      {
        data: {
          id: 'dci-tier/srv-a-01',
          type: 'host',
          name: 'srv-a-01',
        },
      },
      {
        data: {
          id: 'dci-tier/srv-a-02',
          type: 'host',
          name: 'srv-a-02',
        },
      },
      {
        data: {
          id: 'dci-tier/srv-a-03',
          type: 'host',
          name: 'srv-a-03',
        },
      },
      {
        data: {
          id: 'dci-tier/srv-a-04',
          type: 'host',
          name: 'srv-a-04',
        },
      },
      {
        data: {
          id: 'k8s-source/sw-tor-k8s',
          type: 'switch',
          name: 'ToR k8s (k8s-source)',
          other_out_bps: 18000000000,
        },
      },
      {
        data: {
          id: 'k8s-source/node-w-21',
          type: 'node',
          name: 'node-w-21',
        },
      },
      {
        data: {
          id: 'k8s-source/node-w-22',
          type: 'node',
          name: 'node-w-22',
        },
      },
      {
        data: {
          id: 'k8s-source/web-6f8d',
          type: 'pod',
          labels: {
            namespace: 'frontend',
          },
          name: 'web-6f8d',
        },
      },
      {
        data: {
          id: 'k8s-source/cache-1',
          type: 'pod',
          labels: {
            namespace: 'frontend',
          },
          name: 'cache-1',
        },
      },
      {
        data: {
          id: 'k8s-source/batch-9k',
          type: 'pod',
          labels: {
            namespace: 'batch',
          },
          name: 'batch-9k',
        },
      },
      {
        data: {
          id: 'k8s-source/job-runner-5c',
          type: 'pod',
          labels: {
            namespace: 'batch',
          },
          name: 'job-runner-5c',
        },
      },
    ],
    edges: [
      {
        data: {
          id: 'dci-uturn/e0',
          type: 'network-flow',
          source: 'dci-uturn/core-1',
          target: 'dci-uturn/bdr-1',
          labels: {
            source_iface: 'et-0/0/1',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e1',
          type: 'network-flow',
          source: 'dci-uturn/core-1',
          target: 'dci-uturn/bdr-2',
          labels: {
            source_iface: 'et-0/0/2',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e2',
          type: 'network-flow',
          source: 'dci-uturn/core-1',
          target: 'dci-uturn/bdr-3',
          labels: {
            source_iface: 'et-0/0/3',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e3',
          type: 'network-flow',
          source: 'dci-uturn/core-1',
          target: 'dci-uturn/bdr-4',
          labels: {
            source_iface: 'et-0/0/4',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e4',
          type: 'network-flow',
          source: 'dci-uturn/core-1',
          target: 'dci-uturn/bdr-5',
          labels: {
            source_iface: 'et-0/0/5',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e5',
          type: 'network-flow',
          source: 'dci-uturn/core-1',
          target: 'dci-uturn/bdr-6',
          labels: {
            source_iface: 'et-0/0/6',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e6',
          type: 'network-flow',
          source: 'dci-uturn/bdr-1',
          target: 'dci-uturn/dci-1',
          labels: {
            source_iface: 'et-2/0/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e7',
          type: 'network-flow',
          source: 'dci-uturn/bdr-1',
          target: 'dci-uturn/spn-1',
          labels: {
            source_iface: 'et-2/0/2',
            target_iface: 'et-0/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e8',
          type: 'network-flow',
          source: 'dci-uturn/bdr-2',
          target: 'dci-uturn/dci-1',
          labels: {
            source_iface: 'et-2/0/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e9',
          type: 'network-flow',
          source: 'dci-uturn/bdr-2',
          target: 'dci-uturn/spn-1',
          labels: {
            source_iface: 'et-2/0/2',
            target_iface: 'et-0/0/2',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e10',
          type: 'network-flow',
          source: 'dci-uturn/bdr-3',
          target: 'dci-uturn/dci-2',
          labels: {
            source_iface: 'et-2/0/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e11',
          type: 'network-flow',
          source: 'dci-uturn/bdr-3',
          target: 'dci-uturn/spn-2',
          labels: {
            source_iface: 'et-2/0/2',
            target_iface: 'et-0/0/3',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e12',
          type: 'network-flow',
          source: 'dci-uturn/bdr-4',
          target: 'dci-uturn/dci-2',
          labels: {
            source_iface: 'et-2/0/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e13',
          type: 'network-flow',
          source: 'dci-uturn/bdr-4',
          target: 'dci-uturn/spn-2',
          labels: {
            source_iface: 'et-2/0/2',
            target_iface: 'et-0/0/4',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e14',
          type: 'network-flow',
          source: 'dci-uturn/bdr-5',
          target: 'dci-uturn/dci-3',
          labels: {
            source_iface: 'et-2/0/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e15',
          type: 'network-flow',
          source: 'dci-uturn/bdr-5',
          target: 'dci-uturn/spn-3',
          labels: {
            source_iface: 'et-2/0/2',
            target_iface: 'et-0/0/5',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e16',
          type: 'network-flow',
          source: 'dci-uturn/bdr-6',
          target: 'dci-uturn/dci-3',
          labels: {
            source_iface: 'et-2/0/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e17',
          type: 'network-flow',
          source: 'dci-uturn/bdr-6',
          target: 'dci-uturn/spn-3',
          labels: {
            source_iface: 'et-2/0/2',
            target_iface: 'et-0/0/6',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e18',
          type: 'network-flow',
          source: 'dci-uturn/dci-1',
          target: 'dci-uturn/bdr-3',
          labels: {
            source_iface: 'et-9/0/1',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e19',
          type: 'network-flow',
          source: 'dci-uturn/dci-1',
          target: 'dci-uturn/bdr-4',
          labels: {
            source_iface: 'et-9/0/2',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e20',
          type: 'network-flow',
          source: 'dci-uturn/dci-2',
          target: 'dci-uturn/bdr-5',
          labels: {
            source_iface: 'et-9/0/1',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e21',
          type: 'network-flow',
          source: 'dci-uturn/dci-2',
          target: 'dci-uturn/bdr-6',
          labels: {
            source_iface: 'et-9/0/2',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e22',
          type: 'network-flow',
          source: 'dci-uturn/dci-3',
          target: 'dci-uturn/bdr-1',
          labels: {
            source_iface: 'et-9/0/1',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e23',
          type: 'network-flow',
          source: 'dci-uturn/dci-3',
          target: 'dci-uturn/bdr-2',
          labels: {
            source_iface: 'et-9/0/2',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e24',
          type: 'network-flow',
          source: 'dci-uturn/spn-1',
          target: 'dci-uturn/tor-1',
          labels: {
            source_iface: 'et-3/0/1',
            target_iface: 'et-0/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e25',
          type: 'network-flow',
          source: 'dci-uturn/spn-1',
          target: 'dci-uturn/tor-2',
          labels: {
            source_iface: 'et-3/0/2',
            target_iface: 'et-0/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e26',
          type: 'network-flow',
          source: 'dci-uturn/spn-2',
          target: 'dci-uturn/tor-2',
          labels: {
            source_iface: 'et-3/0/2',
            target_iface: 'et-0/0/2',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e27',
          type: 'network-flow',
          source: 'dci-uturn/spn-2',
          target: 'dci-uturn/tor-3',
          labels: {
            source_iface: 'et-3/0/3',
            target_iface: 'et-0/0/2',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e28',
          type: 'network-flow',
          source: 'dci-uturn/spn-3',
          target: 'dci-uturn/tor-1',
          labels: {
            source_iface: 'et-3/0/1',
            target_iface: 'et-0/0/3',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e29',
          type: 'network-flow',
          source: 'dci-uturn/spn-3',
          target: 'dci-uturn/tor-4',
          labels: {
            source_iface: 'et-3/0/4',
            target_iface: 'et-0/0/3',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e30',
          type: 'network-flow',
          source: 'dci-uturn/tor-1',
          target: 'k8s/sw-tor-k8s',
          labels: {
            source_iface: 'xe-0/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e31',
          type: 'network-flow',
          source: 'dci-uturn/tor-2',
          target: 'client/sw-tor-1',
          labels: {
            source_iface: 'xe-0/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e32',
          type: 'network-flow',
          source: 'dci-uturn/tor-3',
          target: 'dci-uturn/srv-3',
          labels: {
            source_iface: 'xe-0/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-uturn/e33',
          type: 'network-flow',
          source: 'dci-uturn/tor-4',
          target: 'dci-uturn/srv-4',
          labels: {
            source_iface: 'xe-0/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e0',
          type: 'network-flow',
          source: 'k8s/sw-tor-k8s',
          target: 'k8s/node-w-11',
          labels: {
            source_iface: 'xe-0/0/11',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 14000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e1',
          type: 'network-flow',
          source: 'k8s/sw-tor-k8s',
          target: 'k8s/node-w-12',
          labels: {
            source_iface: 'xe-0/0/12',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 8000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e2',
          type: 'network-flow',
          source: 'k8s/sw-tor-k8s',
          target: 'k8s/node-w-13',
          labels: {
            source_iface: 'xe-0/0/13',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 5000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e3',
          type: 'network-flow',
          source: 'k8s/sw-tor-k8s',
          target: 'k8s/srv-log-01',
          labels: {
            source_iface: 'xe-0/0/20',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 3000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e4',
          type: 'network-flow',
          source: 'k8s/node-w-11',
          target: 'k8s/ingest-7d9c',
          labels: {
            source_iface: 'veth3a1f',
          },
          metrics: {
            delta_bps: 8000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e5',
          type: 'network-flow',
          source: 'k8s/node-w-11',
          target: 'k8s/kafka-2',
          labels: {
            source_iface: 'veth9b02',
          },
          metrics: {
            delta_bps: 3500000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e6',
          type: 'network-flow',
          source: 'k8s/node-w-12',
          target: 'k8s/ingest-4f11',
          metrics: {
            delta_bps: 5500000000,
          },
        },
      },
      {
        data: {
          id: 'k8s/e7',
          type: 'network-flow',
          source: 'k8s/node-w-12',
          target: 'k8s/debug-shell',
          metrics: {
            delta_bps: 2500000000,
          },
        },
      },
      {
        data: {
          id: 'client/c1',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/sw-tor-1:xe-0/0/12',
          labels: {
            source_iface: 'xe-0/0/12',
          },
          metrics: {
            delta_bps: 12000000000,
          },
        },
      },
      {
        data: {
          id: 'client/c2',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/sw-tor-1:xe-0/0/13',
          labels: {
            source_iface: 'xe-0/0/13',
          },
          metrics: {
            delta_bps: 8000000000,
          },
        },
      },
      {
        data: {
          id: 'client/c3',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/sw-tor-1:xe-0/0/14',
          labels: {
            source_iface: 'xe-0/0/14',
          },
          metrics: {
            delta_bps: 10000000000,
          },
        },
      },
      {
        data: {
          id: 'client/c4',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/sw-tor-1:xe-0/0/15',
          labels: {
            source_iface: 'xe-0/0/15',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'client/c5',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/srv-legacy-09',
          labels: {
            source_iface: 'xe-0/0/16',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'client/c6',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/sw-tor-1:xe-0/0/17',
          labels: {
            source_iface: 'xe-0/0/17',
          },
          metrics: {
            delta_bps: 7000000000,
          },
        },
      },
      {
        data: {
          id: 'client/c7',
          type: 'network-flow',
          source: 'client/sw-tor-1',
          target: 'client/sw-tor-1:xe-0/0/18',
          labels: {
            source_iface: 'xe-0/0/18',
          },
          metrics: {
            delta_bps: 3000000000,
          },
        },
      },
      {
        data: {
          id: 'classic/e0',
          type: 'network-flow',
          source: 'classic/sw-edge-a',
          target: 'classic/sw-core-1',
          labels: {
            source_iface: 'et-0/0/48',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 20000000000,
          },
        },
      },
      {
        data: {
          id: 'classic/e1',
          type: 'network-flow',
          source: 'classic/sw-core-1',
          target: 'classic/srv-db-07',
          labels: {
            source_iface: 'et-1/0/9',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 20000000000,
          },
        },
      },
      {
        data: {
          id: 'dual-uplink/e0',
          type: 'network-flow',
          source: 'dual-uplink/sw-edge-a',
          target: 'dual-uplink/sw-core-1',
          labels: {
            source_iface: 'et-0/0/48',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dual-uplink/e1',
          type: 'network-flow',
          source: 'dual-uplink/sw-edge-a',
          target: 'dual-uplink/sw-core-1',
          labels: {
            source_iface: 'et-0/0/49',
            target_iface: 'et-1/0/2',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dual-uplink/e2',
          type: 'network-flow',
          source: 'dual-uplink/sw-core-1',
          target: 'dual-uplink/sw-agg-9',
          labels: {
            source_iface: 'et-1/0/24',
            target_iface: 'et-9/0/1',
          },
          metrics: {
            delta_bps: 16000000000,
          },
        },
      },
      {
        data: {
          id: 'dual-uplink/e3',
          type: 'network-flow',
          source: 'dual-uplink/sw-agg-9',
          target: 'dual-uplink/srv-cache-02',
          labels: {
            source_iface: 'xe-9/0/12',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 11000000000,
          },
        },
      },
      {
        data: {
          id: 'dual-uplink/e4',
          type: 'network-flow',
          source: 'dual-uplink/sw-agg-9',
          target: 'dual-uplink/srv-cache-03',
          labels: {
            source_iface: 'xe-9/0/13',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 5000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e0',
          type: 'network-flow',
          source: 'campus/sw-dorm-b3',
          target: 'campus/sw-agg-dorm',
          labels: {
            source_iface: 'et-0/0/50',
            target_iface: 'et-2/0/3',
          },
          metrics: {
            delta_bps: 22000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e1',
          type: 'network-flow',
          source: 'campus/sw-agg-dorm',
          target: 'campus/sw-core-n',
          labels: {
            source_iface: 'ae10',
            target_iface: 'ae1',
          },
          metrics: {
            delta_bps: 18000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e2',
          type: 'network-flow',
          source: 'campus/sw-agg-dorm',
          target: 'campus/fw-campus',
          labels: {
            source_iface: 'xe-2/0/7',
            target_iface: 'xe-0/0/0',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e3',
          type: 'network-flow',
          source: 'campus/sw-core-n',
          target: 'campus/rtr-tanet',
          labels: {
            source_iface: 'et-0/0/1',
            target_iface: 'Te0/1/0',
          },
          metrics: {
            delta_bps: 12000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e4',
          type: 'network-flow',
          source: 'campus/sw-core-n',
          target: 'campus/sw-dc-spine',
          labels: {
            source_iface: 'et-0/0/2',
            target_iface: 'et-1/1/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e5',
          type: 'network-flow',
          source: 'campus/fw-campus',
          target: 'campus/rtr-tanet',
          labels: {
            source_iface: 'xe-0/0/1',
            target_iface: 'Te0/1/1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'campus/e6',
          type: 'network-flow',
          source: 'campus/sw-dc-spine',
          target: 'campus/srv-nas-01',
          labels: {
            source_iface: 'et-1/1/9',
            target_iface: 'ens5f0',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'pruned/e0',
          type: 'network-flow',
          source: 'pruned/sw-tor-14',
          target: 'pruned/sw-leaf-3',
          labels: {
            source_iface: 'xe-0/0/1',
            target_iface: 'et-3/0/1',
          },
          metrics: {
            delta_bps: 18000000000,
          },
        },
      },
      {
        data: {
          id: 'pruned/e1',
          type: 'network-flow',
          source: 'pruned/sw-tor-14',
          target: 'pruned/srv-app-11',
          labels: {
            source_iface: 'xe-0/0/2',
            target_iface: 'eno2',
          },
          metrics: {
            delta_bps: 9000000000,
          },
        },
      },
      {
        data: {
          id: 'pruned/e2',
          type: 'network-flow',
          source: 'pruned/sw-tor-14',
          target: 'pruned/srv-app-12',
          labels: {
            source_iface: 'xe-0/0/3',
            target_iface: 'eno2',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'pruned/e3',
          type: 'network-flow',
          source: 'pruned/sw-leaf-3',
          target: 'pruned/srv-log-01',
          labels: {
            source_iface: 'xe-3/0/8',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 10000000000,
          },
        },
      },
      {
        data: {
          id: 'pruned/e4',
          type: 'network-flow',
          source: 'pruned/sw-leaf-3',
          target: 'pruned/srv-log-02',
          labels: {
            source_iface: 'xe-3/0/9',
            target_iface: 'bond0',
          },
          metrics: {
            delta_bps: 5000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e0',
          type: 'network-flow',
          source: 'dci-tier/core-1',
          target: 'dci-tier/bdr-1',
          labels: {
            source_iface: 'et-0/0/1',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e1',
          type: 'network-flow',
          source: 'dci-tier/core-1',
          target: 'dci-tier/bdr-2',
          labels: {
            source_iface: 'et-0/0/2',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e2',
          type: 'network-flow',
          source: 'dci-tier/core-1',
          target: 'dci-tier/bdr-3',
          labels: {
            source_iface: 'et-0/0/3',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e3',
          type: 'network-flow',
          source: 'dci-tier/core-1',
          target: 'dci-tier/bdr-4',
          labels: {
            source_iface: 'et-0/0/4',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e4',
          type: 'network-flow',
          source: 'dci-tier/core-1',
          target: 'dci-tier/bdr-5',
          labels: {
            source_iface: 'et-0/0/5',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e5',
          type: 'network-flow',
          source: 'dci-tier/core-1',
          target: 'dci-tier/bdr-6',
          labels: {
            source_iface: 'et-0/0/6',
            target_iface: 'et-1/0/1',
          },
          metrics: {
            delta_bps: 4000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e6',
          type: 'network-flow',
          source: 'dci-tier/bdr-1',
          target: 'dci-tier/dci-1',
          labels: {
            source_iface: 'et-1/1/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e7',
          type: 'network-flow',
          source: 'dci-tier/bdr-1',
          target: 'dci-tier/dci-2',
          labels: {
            source_iface: 'et-1/1/2',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e8',
          type: 'network-flow',
          source: 'dci-tier/bdr-1',
          target: 'dci-tier/spn-1',
          labels: {
            source_iface: 'et-1/2/1',
            target_iface: 'et-2/0/1',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e9',
          type: 'network-flow',
          source: 'dci-tier/bdr-2',
          target: 'dci-tier/dci-1',
          labels: {
            source_iface: 'et-1/1/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e10',
          type: 'network-flow',
          source: 'dci-tier/bdr-2',
          target: 'dci-tier/dci-2',
          labels: {
            source_iface: 'et-1/1/2',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e11',
          type: 'network-flow',
          source: 'dci-tier/bdr-2',
          target: 'dci-tier/spn-2',
          labels: {
            source_iface: 'et-1/2/1',
            target_iface: 'et-2/0/2',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e12',
          type: 'network-flow',
          source: 'dci-tier/bdr-3',
          target: 'dci-tier/dci-1',
          labels: {
            source_iface: 'et-1/1/1',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e13',
          type: 'network-flow',
          source: 'dci-tier/bdr-3',
          target: 'dci-tier/dci-2',
          labels: {
            source_iface: 'et-1/1/2',
            target_iface: 'ae0',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e14',
          type: 'network-flow',
          source: 'dci-tier/bdr-3',
          target: 'dci-tier/spn-3',
          labels: {
            source_iface: 'et-1/2/1',
            target_iface: 'et-2/0/3',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e15',
          type: 'network-flow',
          source: 'dci-tier/dci-1',
          target: 'dci-tier/bdr-4',
          labels: {
            source_iface: 'et-9/0/1',
            target_iface: 'et-1/0/2',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e16',
          type: 'network-flow',
          source: 'dci-tier/dci-1',
          target: 'dci-tier/bdr-5',
          labels: {
            source_iface: 'et-9/0/2',
            target_iface: 'et-1/0/2',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e17',
          type: 'network-flow',
          source: 'dci-tier/dci-1',
          target: 'dci-tier/bdr-6',
          labels: {
            source_iface: 'et-9/0/3',
            target_iface: 'et-1/0/2',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e18',
          type: 'network-flow',
          source: 'dci-tier/dci-2',
          target: 'dci-tier/bdr-4',
          labels: {
            source_iface: 'et-9/0/1',
            target_iface: 'et-1/0/3',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e19',
          type: 'network-flow',
          source: 'dci-tier/dci-2',
          target: 'dci-tier/bdr-5',
          labels: {
            source_iface: 'et-9/0/2',
            target_iface: 'et-1/0/3',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e20',
          type: 'network-flow',
          source: 'dci-tier/dci-2',
          target: 'dci-tier/bdr-6',
          labels: {
            source_iface: 'et-9/0/3',
            target_iface: 'et-1/0/3',
          },
          metrics: {
            delta_bps: 1000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e21',
          type: 'network-flow',
          source: 'dci-tier/bdr-4',
          target: 'dci-tier/spn-1',
          labels: {
            source_iface: 'et-1/2/1',
            target_iface: 'et-2/0/4',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e22',
          type: 'network-flow',
          source: 'dci-tier/bdr-4',
          target: 'dci-tier/spn-2',
          labels: {
            source_iface: 'et-1/2/2',
            target_iface: 'et-2/0/4',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e23',
          type: 'network-flow',
          source: 'dci-tier/bdr-4',
          target: 'dci-tier/spn-3',
          labels: {
            source_iface: 'et-1/2/3',
            target_iface: 'et-2/0/4',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e24',
          type: 'network-flow',
          source: 'dci-tier/bdr-5',
          target: 'dci-tier/spn-1',
          labels: {
            source_iface: 'et-1/2/1',
            target_iface: 'et-2/0/5',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e25',
          type: 'network-flow',
          source: 'dci-tier/bdr-5',
          target: 'dci-tier/spn-2',
          labels: {
            source_iface: 'et-1/2/2',
            target_iface: 'et-2/0/5',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e26',
          type: 'network-flow',
          source: 'dci-tier/bdr-5',
          target: 'dci-tier/spn-3',
          labels: {
            source_iface: 'et-1/2/3',
            target_iface: 'et-2/0/5',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e27',
          type: 'network-flow',
          source: 'dci-tier/bdr-6',
          target: 'dci-tier/spn-1',
          labels: {
            source_iface: 'et-1/2/1',
            target_iface: 'et-2/0/6',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e28',
          type: 'network-flow',
          source: 'dci-tier/bdr-6',
          target: 'dci-tier/spn-2',
          labels: {
            source_iface: 'et-1/2/2',
            target_iface: 'et-2/0/6',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e29',
          type: 'network-flow',
          source: 'dci-tier/bdr-6',
          target: 'dci-tier/spn-3',
          labels: {
            source_iface: 'et-1/2/3',
            target_iface: 'et-2/0/6',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e30',
          type: 'network-flow',
          source: 'dci-tier/spn-1',
          target: 'dci-tier/tor-1',
          labels: {
            source_iface: 'et-2/1/1',
            target_iface: 'et-3/0/1',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e31',
          type: 'network-flow',
          source: 'dci-tier/spn-1',
          target: 'dci-tier/tor-2',
          labels: {
            source_iface: 'et-2/1/2',
            target_iface: 'et-3/0/1',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e32',
          type: 'network-flow',
          source: 'dci-tier/spn-1',
          target: 'dci-tier/tor-3',
          labels: {
            source_iface: 'et-2/1/3',
            target_iface: 'et-3/0/1',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e33',
          type: 'network-flow',
          source: 'dci-tier/spn-1',
          target: 'dci-tier/tor-4',
          labels: {
            source_iface: 'et-2/1/4',
            target_iface: 'et-3/0/1',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e34',
          type: 'network-flow',
          source: 'dci-tier/spn-2',
          target: 'dci-tier/tor-1',
          labels: {
            source_iface: 'et-2/1/1',
            target_iface: 'et-3/0/2',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e35',
          type: 'network-flow',
          source: 'dci-tier/spn-2',
          target: 'dci-tier/tor-2',
          labels: {
            source_iface: 'et-2/1/2',
            target_iface: 'et-3/0/2',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e36',
          type: 'network-flow',
          source: 'dci-tier/spn-2',
          target: 'dci-tier/tor-3',
          labels: {
            source_iface: 'et-2/1/3',
            target_iface: 'et-3/0/2',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e37',
          type: 'network-flow',
          source: 'dci-tier/spn-2',
          target: 'dci-tier/tor-4',
          labels: {
            source_iface: 'et-2/1/4',
            target_iface: 'et-3/0/2',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e38',
          type: 'network-flow',
          source: 'dci-tier/spn-3',
          target: 'dci-tier/tor-1',
          labels: {
            source_iface: 'et-2/1/1',
            target_iface: 'et-3/0/3',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e39',
          type: 'network-flow',
          source: 'dci-tier/spn-3',
          target: 'dci-tier/tor-2',
          labels: {
            source_iface: 'et-2/1/2',
            target_iface: 'et-3/0/3',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e40',
          type: 'network-flow',
          source: 'dci-tier/spn-3',
          target: 'dci-tier/tor-3',
          labels: {
            source_iface: 'et-2/1/3',
            target_iface: 'et-3/0/3',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e41',
          type: 'network-flow',
          source: 'dci-tier/spn-3',
          target: 'dci-tier/tor-4',
          labels: {
            source_iface: 'et-2/1/4',
            target_iface: 'et-3/0/3',
          },
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e42',
          type: 'network-flow',
          source: 'dci-tier/tor-1',
          target: 'dci-tier/srv-a-01',
          labels: {
            source_iface: 'xe-3/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e43',
          type: 'network-flow',
          source: 'dci-tier/tor-2',
          target: 'dci-tier/srv-a-02',
          labels: {
            source_iface: 'xe-3/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e44',
          type: 'network-flow',
          source: 'dci-tier/tor-3',
          target: 'dci-tier/srv-a-03',
          labels: {
            source_iface: 'xe-3/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'dci-tier/e45',
          type: 'network-flow',
          source: 'dci-tier/tor-4',
          target: 'dci-tier/srv-a-04',
          labels: {
            source_iface: 'xe-3/0/10',
            target_iface: 'eno1',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s-source/e0',
          type: 'network-flow',
          source: 'k8s-source/node-w-21',
          target: 'k8s-source/sw-tor-k8s',
          labels: {
            source_iface: 'bond0',
            target_iface: 'xe-0/0/21',
          },
          metrics: {
            delta_bps: 12000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s-source/e1',
          type: 'network-flow',
          source: 'k8s-source/node-w-22',
          target: 'k8s-source/sw-tor-k8s',
          labels: {
            source_iface: 'bond0',
            target_iface: 'xe-0/0/22',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s-source/e2',
          type: 'network-flow',
          source: 'k8s-source/web-6f8d',
          target: 'k8s-source/node-w-21',
          metrics: {
            delta_bps: 7000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s-source/e3',
          type: 'network-flow',
          source: 'k8s-source/cache-1',
          target: 'k8s-source/node-w-21',
          metrics: {
            delta_bps: 3000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s-source/e4',
          type: 'network-flow',
          source: 'k8s-source/batch-9k',
          target: 'k8s-source/node-w-21',
          metrics: {
            delta_bps: 2000000000,
          },
        },
      },
      {
        data: {
          id: 'k8s-source/e5',
          type: 'network-flow',
          source: 'k8s-source/job-runner-5c',
          target: 'k8s-source/node-w-22',
          labels: {
            target_iface: 'veth71aa',
          },
          metrics: {
            delta_bps: 6000000000,
          },
        },
      },
    ],
  },
};
