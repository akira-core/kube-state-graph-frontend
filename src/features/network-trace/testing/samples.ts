// Trace wire samples ported from sankey-panel (samples/*.json): the fixture corpus for the
// network-trace model, layout and golden tests. Pure data — every sample is a full backend
// response body. `direction` mirrors the sample's top-level `kind`, which the live backend
// does not send (the request's track_dir decides it); tests pass it through explicitly.
export interface TraceSample {
  key: string;
  direction: 'destination' | 'source';
  wire: unknown;
}

export const TRACE_SAMPLE_CLASSIC: TraceSample = {
  key: 'classic',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-edge-a',
            type: 'switch',
            name: 'Edge A',
            investigation: {
              iface: 'xe-0/0/1',
              delta_bps: 10000000000,
              direction: 'in',
              note: 'Edge A 的 access port 進來 +10 Gbps',
            },
          },
        },
        {
          data: {
            id: 'sw-core-1',
            type: 'switch',
            name: 'Core 1',
          },
        },
        {
          data: {
            id: 'srv-db-07',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'sw-edge-a',
            target: 'sw-core-1',
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
            id: 'e1',
            type: 'network-flow',
            source: 'sw-core-1',
            target: 'srv-db-07',
            labels: {
              source_iface: 'et-1/0/9',
              target_iface: 'eno1',
            },
            metrics: {
              delta_bps: 20000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_DUAL_UPLINK: TraceSample = {
  key: 'dual-uplink',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-edge-a',
            type: 'switch',
            name: 'Edge A',
            investigation: {
              iface: 'xe-0/0/1',
              delta_bps: 10000000000,
              direction: 'in',
            },
          },
        },
        {
          data: {
            id: 'sw-core-1',
            type: 'switch',
            name: 'Core 1',
          },
        },
        {
          data: {
            id: 'sw-agg-9',
            type: 'switch',
            name: 'Agg 9',
          },
        },
        {
          data: {
            id: 'srv-cache-02',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-cache-03',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'sw-edge-a',
            target: 'sw-core-1',
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
            id: 'e1',
            type: 'network-flow',
            source: 'sw-edge-a',
            target: 'sw-core-1',
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
            id: 'e2',
            type: 'network-flow',
            source: 'sw-core-1',
            target: 'sw-agg-9',
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
            id: 'e3',
            type: 'network-flow',
            source: 'sw-agg-9',
            target: 'srv-cache-02',
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
            id: 'e4',
            type: 'network-flow',
            source: 'sw-agg-9',
            target: 'srv-cache-03',
            labels: {
              source_iface: 'xe-9/0/13',
              target_iface: 'bond0',
            },
            metrics: {
              delta_bps: 5000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_SOURCE: TraceSample = {
  key: 'source',
  direction: 'source',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-core-1',
            type: 'switch',
            name: 'Core 1',
            investigation: {
              iface: 'et-1/0/9',
              delta_bps: 20000000000,
              direction: 'out',
              note: 'Core 1 出向 et-1/0/9 +20 Gbps，問誰灌的',
            },
          },
        },
        {
          data: {
            id: 'sw-edge-a',
            type: 'switch',
            name: 'Edge A',
          },
        },
        {
          data: {
            id: 'sw-edge-b',
            type: 'switch',
            name: 'Edge B',
            other_in_bps: 2000000000,
          },
        },
        {
          data: {
            id: 'lab-gpu-01',
            type: 'host',
          },
        },
        {
          data: {
            id: 'lab-gpu-02',
            type: 'host',
          },
        },
        {
          data: {
            id: 'backup-relay',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'sw-edge-a',
            target: 'sw-core-1',
            labels: {
              source_iface: 'et-0/0/48',
              target_iface: 'et-1/0/1',
            },
            metrics: {
              delta_bps: 12000000000,
            },
          },
        },
        {
          data: {
            id: 'e1',
            type: 'network-flow',
            source: 'sw-edge-b',
            target: 'sw-core-1',
            labels: {
              source_iface: 'et-0/0/48',
              target_iface: 'et-1/0/2',
            },
            metrics: {
              delta_bps: 6000000000,
            },
          },
        },
        {
          data: {
            id: 'e2',
            type: 'network-flow',
            source: 'lab-gpu-01',
            target: 'sw-edge-a',
            labels: {
              source_iface: 'eno1',
              target_iface: 'xe-0/0/1',
            },
            metrics: {
              delta_bps: 7000000000,
            },
          },
        },
        {
          data: {
            id: 'e3',
            type: 'network-flow',
            source: 'lab-gpu-02',
            target: 'sw-edge-a',
            labels: {
              source_iface: 'eno1',
              target_iface: 'xe-0/0/2',
            },
            metrics: {
              delta_bps: 3000000000,
            },
          },
        },
        {
          data: {
            id: 'e4',
            type: 'network-flow',
            source: 'backup-relay',
            target: 'sw-edge-b',
            labels: {
              source_iface: 'eth0',
              target_iface: 'xe-0/0/5',
            },
            metrics: {
              delta_bps: 4000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_PRUNED: TraceSample = {
  key: 'pruned',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-tor-14',
            type: 'switch',
            name: 'ToR 14',
            investigation: {
              iface: 'et-0/0/52',
              delta_bps: 40000000000,
              direction: 'in',
            },
            other_out_bps: 9000000000,
          },
        },
        {
          data: {
            id: 'sw-leaf-3',
            type: 'switch',
            name: 'Leaf 3',
            other_out_bps: 3000000000,
          },
        },
        {
          data: {
            id: 'srv-app-11',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-app-12',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-log-01',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-log-02',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'sw-tor-14',
            target: 'sw-leaf-3',
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
            id: 'e1',
            type: 'network-flow',
            source: 'sw-tor-14',
            target: 'srv-app-11',
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
            id: 'e2',
            type: 'network-flow',
            source: 'sw-tor-14',
            target: 'srv-app-12',
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
            id: 'e3',
            type: 'network-flow',
            source: 'sw-leaf-3',
            target: 'srv-log-01',
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
            id: 'e4',
            type: 'network-flow',
            source: 'sw-leaf-3',
            target: 'srv-log-02',
            labels: {
              source_iface: 'xe-3/0/9',
              target_iface: 'bond0',
            },
            metrics: {
              delta_bps: 5000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_CAMPUS: TraceSample = {
  key: 'campus',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-dorm-b3',
            type: 'switch',
            name: '宿網 B3',
            investigation: {
              iface: 'ae0',
              delta_bps: 8000000000,
              direction: 'in',
              note: '宿舍 B3 上聯 ae0 進向 +8 Gbps',
            },
          },
        },
        {
          data: {
            id: 'sw-agg-dorm',
            type: 'switch',
            name: '宿區匯聚',
          },
        },
        {
          data: {
            id: 'sw-core-n',
            type: 'switch',
            name: '核心 North',
          },
        },
        {
          data: {
            id: 'fw-campus',
            type: 'switch',
            name: '校園防火牆',
          },
        },
        {
          data: {
            id: 'sw-dc-spine',
            type: 'switch',
            name: '機房 Spine',
          },
        },
        {
          data: {
            id: 'rtr-tanet',
            type: 'router',
          },
        },
        {
          data: {
            id: 'srv-nas-01',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'sw-dorm-b3',
            target: 'sw-agg-dorm',
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
            id: 'e1',
            type: 'network-flow',
            source: 'sw-agg-dorm',
            target: 'sw-core-n',
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
            id: 'e2',
            type: 'network-flow',
            source: 'sw-agg-dorm',
            target: 'fw-campus',
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
            id: 'e3',
            type: 'network-flow',
            source: 'sw-core-n',
            target: 'rtr-tanet',
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
            id: 'e4',
            type: 'network-flow',
            source: 'sw-core-n',
            target: 'sw-dc-spine',
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
            id: 'e5',
            type: 'network-flow',
            source: 'fw-campus',
            target: 'rtr-tanet',
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
            id: 'e6',
            type: 'network-flow',
            source: 'sw-dc-spine',
            target: 'srv-nas-01',
            labels: {
              source_iface: 'et-1/1/9',
              target_iface: 'ens5f0',
            },
            metrics: {
              delta_bps: 4000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_CLIENT: TraceSample = {
  key: 'client',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-tor-1',
            type: 'switch',
            name: 'ToR 1',
            investigation: {
              iface: 'et-0/0/49',
              delta_bps: 50000000000,
              direction: 'in',
              note: 'ToR 1 的 uplink 進來 +50 Gbps，往下的 access port 多半沒有 LLDP 鄰居',
            },
          },
        },
        {
          data: {
            id: 'sw-tor-1:xe-0/0/12',
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
            id: 'sw-tor-1:xe-0/0/13',
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
            id: 'sw-tor-1:xe-0/0/14',
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
            id: 'sw-tor-1:xe-0/0/15',
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
            id: 'sw-tor-1:xe-0/0/17',
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
            id: 'sw-tor-1:xe-0/0/18',
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
            id: 'srv-legacy-09',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'c1',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'sw-tor-1:xe-0/0/12',
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
            id: 'c2',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'sw-tor-1:xe-0/0/13',
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
            id: 'c3',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'sw-tor-1:xe-0/0/14',
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
            id: 'c4',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'sw-tor-1:xe-0/0/15',
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
            id: 'c5',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'srv-legacy-09',
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
            id: 'c6',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'sw-tor-1:xe-0/0/17',
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
            id: 'c7',
            type: 'network-flow',
            source: 'sw-tor-1',
            target: 'sw-tor-1:xe-0/0/18',
            labels: {
              source_iface: 'xe-0/0/18',
            },
            metrics: {
              delta_bps: 3000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_K8S: TraceSample = {
  key: 'k8s',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-tor-k8s',
            type: 'switch',
            name: 'ToR k8s',
            investigation: {
              iface: 'et-0/0/48',
              delta_bps: 30000000000,
              direction: 'in',
            },
          },
        },
        {
          data: {
            id: 'node-w-11',
            type: 'node',
            name: 'node-w-11',
            other_out_bps: 2500000000,
          },
        },
        {
          data: {
            id: 'node-w-12',
            type: 'node',
            name: 'node-w-12',
          },
        },
        {
          data: {
            id: 'node-w-13',
            type: 'node',
            name: 'node-w-13',
          },
        },
        {
          data: {
            id: 'srv-log-01',
            type: 'host',
          },
        },
        {
          data: {
            id: 'ingest-7d9c',
            type: 'pod',
            labels: {
              namespace: 'telemetry',
            },
          },
        },
        {
          data: {
            id: 'kafka-2',
            type: 'pod',
            labels: {
              namespace: 'stream',
            },
          },
        },
        {
          data: {
            id: 'ingest-4f11',
            type: 'pod',
            labels: {
              namespace: 'telemetry',
            },
          },
        },
        {
          data: {
            id: 'debug-shell',
            type: 'pod',
            labels: {
              namespace: 'debug',
            },
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'sw-tor-k8s',
            target: 'node-w-11',
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
            id: 'e1',
            type: 'network-flow',
            source: 'sw-tor-k8s',
            target: 'node-w-12',
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
            id: 'e2',
            type: 'network-flow',
            source: 'sw-tor-k8s',
            target: 'node-w-13',
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
            id: 'e3',
            type: 'network-flow',
            source: 'sw-tor-k8s',
            target: 'srv-log-01',
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
            id: 'e4',
            type: 'network-flow',
            source: 'node-w-11',
            target: 'ingest-7d9c',
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
            id: 'e5',
            type: 'network-flow',
            source: 'node-w-11',
            target: 'kafka-2',
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
            id: 'e6',
            type: 'network-flow',
            source: 'node-w-12',
            target: 'ingest-4f11',
            metrics: {
              delta_bps: 5500000000,
            },
          },
        },
        {
          data: {
            id: 'e7',
            type: 'network-flow',
            source: 'node-w-12',
            target: 'debug-shell',
            metrics: {
              delta_bps: 2500000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_K8S_SOURCE: TraceSample = {
  key: 'k8s-source',
  direction: 'source',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'sw-tor-k8s',
            type: 'switch',
            name: 'ToR k8s',
            investigation: {
              iface: 'et-0/0/48',
              delta_bps: 18000000000,
              direction: 'out',
              note: 'ToR uplink 出量 +18G，追是哪些 pod 打出來的',
            },
          },
        },
        {
          data: {
            id: 'node-w-21',
            type: 'node',
            name: 'node-w-21',
          },
        },
        {
          data: {
            id: 'node-w-22',
            type: 'node',
            name: 'node-w-22',
          },
        },
        {
          data: {
            id: 'web-6f8d',
            type: 'pod',
            labels: {
              namespace: 'frontend',
            },
          },
        },
        {
          data: {
            id: 'cache-1',
            type: 'pod',
            labels: {
              namespace: 'frontend',
            },
          },
        },
        {
          data: {
            id: 'batch-9k',
            type: 'pod',
            labels: {
              namespace: 'batch',
            },
          },
        },
        {
          data: {
            id: 'job-runner-5c',
            type: 'pod',
            labels: {
              namespace: 'batch',
            },
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'node-w-21',
            target: 'sw-tor-k8s',
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
            id: 'e1',
            type: 'network-flow',
            source: 'node-w-22',
            target: 'sw-tor-k8s',
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
            id: 'e2',
            type: 'network-flow',
            source: 'web-6f8d',
            target: 'node-w-21',
            metrics: {
              delta_bps: 7000000000,
            },
          },
        },
        {
          data: {
            id: 'e3',
            type: 'network-flow',
            source: 'cache-1',
            target: 'node-w-21',
            metrics: {
              delta_bps: 3000000000,
            },
          },
        },
        {
          data: {
            id: 'e4',
            type: 'network-flow',
            source: 'batch-9k',
            target: 'node-w-21',
            metrics: {
              delta_bps: 2000000000,
            },
          },
        },
        {
          data: {
            id: 'e5',
            type: 'network-flow',
            source: 'job-runner-5c',
            target: 'node-w-22',
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
  },
};

export const TRACE_SAMPLE_DCI_TIER: TraceSample = {
  key: 'dci-tier',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'core-1',
            type: 'switch',
            name: 'Core',
            investigation: {
              iface: 'et-0/0/0',
              delta_bps: 24000000000,
              direction: 'in',
              note: 'core 進來 +24 Gbps，跨 DC 流量經 dci 繞回同層 bdr',
            },
          },
        },
        {
          data: {
            id: 'bdr-1',
            type: 'switch',
            name: 'BDR 1',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'bdr-2',
            type: 'switch',
            name: 'BDR 2',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'bdr-3',
            type: 'switch',
            name: 'BDR 3',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'dci-1',
            type: 'switch',
            name: 'DCI 1',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'dci-2',
            type: 'switch',
            name: 'DCI 2',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'bdr-4',
            type: 'switch',
            name: 'BDR 4',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'bdr-5',
            type: 'switch',
            name: 'BDR 5',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'bdr-6',
            type: 'switch',
            name: 'BDR 6',
            labels: {
              tier: 'border',
            },
          },
        },
        {
          data: {
            id: 'spn-1',
            type: 'switch',
            name: 'SPN 1',
          },
        },
        {
          data: {
            id: 'spn-2',
            type: 'switch',
            name: 'SPN 2',
          },
        },
        {
          data: {
            id: 'spn-3',
            type: 'switch',
            name: 'SPN 3',
          },
        },
        {
          data: {
            id: 'tor-1',
            type: 'switch',
            name: 'ToR 1',
          },
        },
        {
          data: {
            id: 'tor-2',
            type: 'switch',
            name: 'ToR 2',
          },
        },
        {
          data: {
            id: 'tor-3',
            type: 'switch',
            name: 'ToR 3',
          },
        },
        {
          data: {
            id: 'tor-4',
            type: 'switch',
            name: 'ToR 4',
          },
        },
        {
          data: {
            id: 'srv-a-01',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-a-02',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-a-03',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-a-04',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-1',
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
            id: 'e1',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-2',
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
            id: 'e2',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-3',
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
            id: 'e3',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-4',
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
            id: 'e4',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-5',
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
            id: 'e5',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-6',
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
            id: 'e6',
            type: 'network-flow',
            source: 'bdr-1',
            target: 'dci-1',
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
            id: 'e7',
            type: 'network-flow',
            source: 'bdr-1',
            target: 'dci-2',
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
            id: 'e8',
            type: 'network-flow',
            source: 'bdr-1',
            target: 'spn-1',
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
            id: 'e9',
            type: 'network-flow',
            source: 'bdr-2',
            target: 'dci-1',
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
            id: 'e10',
            type: 'network-flow',
            source: 'bdr-2',
            target: 'dci-2',
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
            id: 'e11',
            type: 'network-flow',
            source: 'bdr-2',
            target: 'spn-2',
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
            id: 'e12',
            type: 'network-flow',
            source: 'bdr-3',
            target: 'dci-1',
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
            id: 'e13',
            type: 'network-flow',
            source: 'bdr-3',
            target: 'dci-2',
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
            id: 'e14',
            type: 'network-flow',
            source: 'bdr-3',
            target: 'spn-3',
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
            id: 'e15',
            type: 'network-flow',
            source: 'dci-1',
            target: 'bdr-4',
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
            id: 'e16',
            type: 'network-flow',
            source: 'dci-1',
            target: 'bdr-5',
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
            id: 'e17',
            type: 'network-flow',
            source: 'dci-1',
            target: 'bdr-6',
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
            id: 'e18',
            type: 'network-flow',
            source: 'dci-2',
            target: 'bdr-4',
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
            id: 'e19',
            type: 'network-flow',
            source: 'dci-2',
            target: 'bdr-5',
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
            id: 'e20',
            type: 'network-flow',
            source: 'dci-2',
            target: 'bdr-6',
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
            id: 'e21',
            type: 'network-flow',
            source: 'bdr-4',
            target: 'spn-1',
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
            id: 'e22',
            type: 'network-flow',
            source: 'bdr-4',
            target: 'spn-2',
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
            id: 'e23',
            type: 'network-flow',
            source: 'bdr-4',
            target: 'spn-3',
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
            id: 'e24',
            type: 'network-flow',
            source: 'bdr-5',
            target: 'spn-1',
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
            id: 'e25',
            type: 'network-flow',
            source: 'bdr-5',
            target: 'spn-2',
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
            id: 'e26',
            type: 'network-flow',
            source: 'bdr-5',
            target: 'spn-3',
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
            id: 'e27',
            type: 'network-flow',
            source: 'bdr-6',
            target: 'spn-1',
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
            id: 'e28',
            type: 'network-flow',
            source: 'bdr-6',
            target: 'spn-2',
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
            id: 'e29',
            type: 'network-flow',
            source: 'bdr-6',
            target: 'spn-3',
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
            id: 'e30',
            type: 'network-flow',
            source: 'spn-1',
            target: 'tor-1',
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
            id: 'e31',
            type: 'network-flow',
            source: 'spn-1',
            target: 'tor-2',
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
            id: 'e32',
            type: 'network-flow',
            source: 'spn-1',
            target: 'tor-3',
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
            id: 'e33',
            type: 'network-flow',
            source: 'spn-1',
            target: 'tor-4',
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
            id: 'e34',
            type: 'network-flow',
            source: 'spn-2',
            target: 'tor-1',
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
            id: 'e35',
            type: 'network-flow',
            source: 'spn-2',
            target: 'tor-2',
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
            id: 'e36',
            type: 'network-flow',
            source: 'spn-2',
            target: 'tor-3',
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
            id: 'e37',
            type: 'network-flow',
            source: 'spn-2',
            target: 'tor-4',
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
            id: 'e38',
            type: 'network-flow',
            source: 'spn-3',
            target: 'tor-1',
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
            id: 'e39',
            type: 'network-flow',
            source: 'spn-3',
            target: 'tor-2',
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
            id: 'e40',
            type: 'network-flow',
            source: 'spn-3',
            target: 'tor-3',
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
            id: 'e41',
            type: 'network-flow',
            source: 'spn-3',
            target: 'tor-4',
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
            id: 'e42',
            type: 'network-flow',
            source: 'tor-1',
            target: 'srv-a-01',
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
            id: 'e43',
            type: 'network-flow',
            source: 'tor-2',
            target: 'srv-a-02',
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
            id: 'e44',
            type: 'network-flow',
            source: 'tor-3',
            target: 'srv-a-03',
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
            id: 'e45',
            type: 'network-flow',
            source: 'tor-4',
            target: 'srv-a-04',
            labels: {
              source_iface: 'xe-3/0/10',
              target_iface: 'eno1',
            },
            metrics: {
              delta_bps: 6000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLE_DCI_UTURN: TraceSample = {
  key: 'dci-uturn',
  direction: 'destination',
  wire: {
    elements: {
      nodes: [
        {
          data: {
            id: 'core-1',
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
            id: 'bdr-1',
            type: 'switch',
            name: 'BDR 1',
            labels: {
              tier: 'bdr',
            },
          },
        },
        {
          data: {
            id: 'bdr-2',
            type: 'switch',
            name: 'BDR 2',
            labels: {
              tier: 'bdr',
            },
          },
        },
        {
          data: {
            id: 'bdr-3',
            type: 'switch',
            name: 'BDR 3',
            labels: {
              tier: 'bdr',
            },
          },
        },
        {
          data: {
            id: 'bdr-4',
            type: 'switch',
            name: 'BDR 4',
            labels: {
              tier: 'bdr',
            },
          },
        },
        {
          data: {
            id: 'bdr-5',
            type: 'switch',
            name: 'BDR 5',
            labels: {
              tier: 'bdr',
            },
          },
        },
        {
          data: {
            id: 'bdr-6',
            type: 'switch',
            name: 'BDR 6',
            labels: {
              tier: 'bdr',
            },
          },
        },
        {
          data: {
            id: 'dci-1',
            type: 'switch',
            name: 'DCI 1',
            labels: {
              tier: 'dci-spn',
            },
          },
        },
        {
          data: {
            id: 'dci-2',
            type: 'switch',
            name: 'DCI 2',
            labels: {
              tier: 'dci-spn',
            },
          },
        },
        {
          data: {
            id: 'dci-3',
            type: 'switch',
            name: 'DCI 3',
            labels: {
              tier: 'dci-spn',
            },
          },
        },
        {
          data: {
            id: 'spn-1',
            type: 'switch',
            name: 'SPN 1',
            labels: {
              tier: 'dci-spn',
            },
          },
        },
        {
          data: {
            id: 'spn-2',
            type: 'switch',
            name: 'SPN 2',
            labels: {
              tier: 'dci-spn',
            },
          },
        },
        {
          data: {
            id: 'spn-3',
            type: 'switch',
            name: 'SPN 3',
            labels: {
              tier: 'dci-spn',
            },
          },
        },
        {
          data: {
            id: 'tor-1',
            type: 'switch',
            name: 'ToR 1',
            labels: {
              tier: 'tor',
            },
          },
        },
        {
          data: {
            id: 'tor-2',
            type: 'switch',
            name: 'ToR 2',
            labels: {
              tier: 'tor',
            },
          },
        },
        {
          data: {
            id: 'tor-3',
            type: 'switch',
            name: 'ToR 3',
            labels: {
              tier: 'tor',
            },
          },
        },
        {
          data: {
            id: 'tor-4',
            type: 'switch',
            name: 'ToR 4',
            labels: {
              tier: 'tor',
            },
          },
        },
        {
          data: {
            id: 'srv-1',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-2',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-3',
            type: 'host',
          },
        },
        {
          data: {
            id: 'srv-4',
            type: 'host',
          },
        },
      ],
      edges: [
        {
          data: {
            id: 'e0',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-1',
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
            id: 'e1',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-2',
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
            id: 'e2',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-3',
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
            id: 'e3',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-4',
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
            id: 'e4',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-5',
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
            id: 'e5',
            type: 'network-flow',
            source: 'core-1',
            target: 'bdr-6',
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
            id: 'e6',
            type: 'network-flow',
            source: 'bdr-1',
            target: 'dci-1',
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
            id: 'e7',
            type: 'network-flow',
            source: 'bdr-1',
            target: 'spn-1',
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
            id: 'e8',
            type: 'network-flow',
            source: 'bdr-2',
            target: 'dci-1',
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
            id: 'e9',
            type: 'network-flow',
            source: 'bdr-2',
            target: 'spn-1',
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
            id: 'e10',
            type: 'network-flow',
            source: 'bdr-3',
            target: 'dci-2',
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
            id: 'e11',
            type: 'network-flow',
            source: 'bdr-3',
            target: 'spn-2',
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
            id: 'e12',
            type: 'network-flow',
            source: 'bdr-4',
            target: 'dci-2',
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
            id: 'e13',
            type: 'network-flow',
            source: 'bdr-4',
            target: 'spn-2',
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
            id: 'e14',
            type: 'network-flow',
            source: 'bdr-5',
            target: 'dci-3',
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
            id: 'e15',
            type: 'network-flow',
            source: 'bdr-5',
            target: 'spn-3',
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
            id: 'e16',
            type: 'network-flow',
            source: 'bdr-6',
            target: 'dci-3',
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
            id: 'e17',
            type: 'network-flow',
            source: 'bdr-6',
            target: 'spn-3',
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
            id: 'e18',
            type: 'network-flow',
            source: 'dci-1',
            target: 'bdr-3',
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
            id: 'e19',
            type: 'network-flow',
            source: 'dci-1',
            target: 'bdr-4',
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
            id: 'e20',
            type: 'network-flow',
            source: 'dci-2',
            target: 'bdr-5',
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
            id: 'e21',
            type: 'network-flow',
            source: 'dci-2',
            target: 'bdr-6',
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
            id: 'e22',
            type: 'network-flow',
            source: 'dci-3',
            target: 'bdr-1',
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
            id: 'e23',
            type: 'network-flow',
            source: 'dci-3',
            target: 'bdr-2',
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
            id: 'e24',
            type: 'network-flow',
            source: 'spn-1',
            target: 'tor-1',
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
            id: 'e25',
            type: 'network-flow',
            source: 'spn-1',
            target: 'tor-2',
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
            id: 'e26',
            type: 'network-flow',
            source: 'spn-2',
            target: 'tor-2',
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
            id: 'e27',
            type: 'network-flow',
            source: 'spn-2',
            target: 'tor-3',
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
            id: 'e28',
            type: 'network-flow',
            source: 'spn-3',
            target: 'tor-1',
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
            id: 'e29',
            type: 'network-flow',
            source: 'spn-3',
            target: 'tor-4',
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
            id: 'e30',
            type: 'network-flow',
            source: 'tor-1',
            target: 'srv-1',
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
            id: 'e31',
            type: 'network-flow',
            source: 'tor-2',
            target: 'srv-2',
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
            id: 'e32',
            type: 'network-flow',
            source: 'tor-3',
            target: 'srv-3',
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
            id: 'e33',
            type: 'network-flow',
            source: 'tor-4',
            target: 'srv-4',
            labels: {
              source_iface: 'xe-0/0/10',
              target_iface: 'eno1',
            },
            metrics: {
              delta_bps: 6000000000,
            },
          },
        },
      ],
    },
  },
};

export const TRACE_SAMPLES: readonly TraceSample[] = [
  TRACE_SAMPLE_CLASSIC,
  TRACE_SAMPLE_DUAL_UPLINK,
  TRACE_SAMPLE_SOURCE,
  TRACE_SAMPLE_PRUNED,
  TRACE_SAMPLE_CAMPUS,
  TRACE_SAMPLE_CLIENT,
  TRACE_SAMPLE_K8S,
  TRACE_SAMPLE_K8S_SOURCE,
  TRACE_SAMPLE_DCI_TIER,
  TRACE_SAMPLE_DCI_UTURN,
];

export function traceSample(key: string): TraceSample {
  const found = TRACE_SAMPLES.find((s) => s.key === key);
  if (found === undefined) {
    throw new Error(`unknown trace sample ${key}`);
  }
  return found;
}
