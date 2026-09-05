// Single source of design tokens. Light / dark objects share an identical key
// set (enforced by ThemeTokens + a unit test). CSS variables, the cytoscape
// stylesheet factory, and Sankey SVG all read from here.

export interface ThemeTokens {
  bg: {
    canvas: string;
    surface: string;
    elevated: string;
    overlay: string;
  };
  fg: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    link: string;
  };
  border: {
    weak: string;
    medium: string;
    strong: string;
  };
  accent: {
    primary: string;
  };
  status: {
    normal: string;
    warning: string;
    critical: string;
    error: string;
  };
  kind: {
    pod: string;
    node: string;
    service: string;
    pvc: string;
    controller: string;
    switch: string;
    'netapp-aggr': string;
    'netapp-node': string;
    'netapp-svm': string;
    cluster: string;
    namespace: string;
    application: string;
    'storage-cluster': string;
    network: string;
    external: string;
  };
  edge: {
    'pod-to-node': string;
    'pod-mounts-pvc': string;
    'pod-calls-pod': string;
    'pod-calls-service': string;
    'service-selects-pod': string;
    'pvc-to-netapp-aggr': string;
    'switch-to-switch': string;
    'node-to-switch': string;
    'storage-flow': string;
    fallback: string;
  };
  sankey: {
    read: string;
    write: string;
    readMuted: string;
    writeMuted: string;
    /** Far (target) end of a link's gradient — same hue family as `read`, so direction stays legible mid-ribbon. */
    readGradientEnd: string;
    writeGradientEnd: string;
    nodeFill: string;
    nodeStroke: string;
    /**
     * Pod-tier namespace stripe colors — five flat keys (not an array) so every token leaf
     * stays a plain string with its own CSS variable, matching every other entry in this
     * file. Assigned by first-appearance order and cycled; kept out of the read/write hue
     * families.
     */
    namespace1: string;
    namespace2: string;
    namespace3: string;
    namespace4: string;
    namespace5: string;
  };
}

// Grafana dark defaults the panel used via GrafanaTheme2, plus the product
// status / edge / kind hexes from shared/constants.
export const DARK_TOKENS: ThemeTokens = {
  bg: {
    canvas: '#111217',
    surface: '#181b1f',
    elevated: '#22252b',
    overlay: 'rgba(17, 18, 23, 0.86)',
  },
  fg: {
    primary: 'rgb(204, 204, 220)',
    secondary: 'rgba(204, 204, 220, 0.65)',
    muted: 'rgba(204, 204, 220, 0.45)',
    inverse: '#111217',
    link: '#6e9fff',
  },
  border: {
    weak: 'rgba(204, 204, 220, 0.12)',
    medium: 'rgba(204, 204, 220, 0.2)',
    strong: 'rgba(204, 204, 220, 0.3)',
  },
  accent: {
    primary: '#3871dc',
  },
  status: {
    normal: '#73BF69',
    warning: '#F2CC0C',
    critical: '#E02F44',
    error: '#f2495c',
  },
  kind: {
    pod: '#7dd3fc',
    node: '#93c5fd',
    service: '#fdba74',
    pvc: '#d8b4fe',
    controller: '#a5b4fc',
    switch: '#67e8f9',
    'netapp-aggr': '#c4b5fd',
    'netapp-node': '#a78bfa',
    'netapp-svm': '#ddd6fe',
    cluster: '#94a3b8',
    namespace: '#86efac',
    application: '#f9a8d4',
    'storage-cluster': '#818cf8',
    network: '#22d3ee',
    external: '#cbd5e1',
  },
  edge: {
    'pod-to-node': '#3b82f6',
    'pod-mounts-pvc': '#a855f7',
    'pod-calls-pod': '#f97316',
    'pod-calls-service': '#f97316',
    'service-selects-pod': '#f97316',
    'pvc-to-netapp-aggr': '#8b5cf6',
    'switch-to-switch': '#06b6d4',
    'node-to-switch': '#06b6d4',
    'storage-flow': '#6366f1',
    fallback: '#94a3b8',
  },
  sankey: {
    // Read is a cool solid; write is a warm, darker orange so the pair is
    // distinguishable by lightness as well as hue (not hue-only).
    read: '#38bdf8',
    write: '#c2410c',
    readMuted: 'rgba(56, 189, 248, 0.28)',
    writeMuted: 'rgba(194, 65, 12, 0.28)',
    readGradientEnd: '#0ea5e9',
    writeGradientEnd: '#ea580c',
    nodeFill: '#22252b',
    nodeStroke: 'rgba(204, 204, 220, 0.3)',
    namespace1: '#a78bfa',
    namespace2: '#34d399',
    namespace3: '#fbbf24',
    namespace4: '#818cf8',
    namespace5: '#fb7185',
  },
};

export const LIGHT_TOKENS: ThemeTokens = {
  bg: {
    canvas: '#f4f5f5',
    surface: '#ffffff',
    elevated: '#f4f5f5',
    overlay: 'rgba(255, 255, 255, 0.92)',
  },
  fg: {
    primary: 'rgb(36, 41, 46)',
    secondary: 'rgba(36, 41, 46, 0.75)',
    muted: 'rgba(36, 41, 46, 0.5)',
    inverse: '#ffffff',
    link: '#1f62e0',
  },
  border: {
    weak: 'rgba(36, 41, 46, 0.12)',
    medium: 'rgba(36, 41, 46, 0.3)',
    strong: 'rgba(36, 41, 46, 0.4)',
  },
  accent: {
    primary: '#3871dc',
  },
  status: {
    normal: '#73BF69',
    warning: '#F2CC0C',
    critical: '#E02F44',
    error: '#e02f44',
  },
  kind: {
    pod: '#0284c7',
    node: '#2563eb',
    service: '#c2410c',
    pvc: '#7e22ce',
    controller: '#4f46e5',
    switch: '#0e7490',
    'netapp-aggr': '#6d28d9',
    'netapp-node': '#5b21b6',
    'netapp-svm': '#5b21b6',
    cluster: '#475569',
    namespace: '#15803d',
    application: '#be185d',
    'storage-cluster': '#4338ca',
    network: '#0e7490',
    external: '#334155',
  },
  edge: {
    'pod-to-node': '#3b82f6',
    'pod-mounts-pvc': '#a855f7',
    'pod-calls-pod': '#f97316',
    'pod-calls-service': '#f97316',
    'service-selects-pod': '#f97316',
    'pvc-to-netapp-aggr': '#8b5cf6',
    'switch-to-switch': '#06b6d4',
    'node-to-switch': '#06b6d4',
    'storage-flow': '#4f46e5',
    fallback: '#94a3b8',
  },
  sankey: {
    read: '#0284c7',
    write: '#9a3412',
    readMuted: 'rgba(2, 132, 199, 0.22)',
    writeMuted: 'rgba(154, 52, 18, 0.22)',
    readGradientEnd: '#0369a1',
    writeGradientEnd: '#c2410c',
    nodeFill: '#ffffff',
    nodeStroke: 'rgba(36, 41, 46, 0.3)',
    namespace1: '#7c3aed',
    namespace2: '#059669',
    namespace3: '#d97706',
    namespace4: '#4f46e5',
    namespace5: '#e11d48',
  },
};

export type ThemeMode = 'dark' | 'light';

export function tokensForMode(mode: ThemeMode): ThemeTokens {
  return mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}

// Shape getStylesheet and DOM consumers used to read off GrafanaTheme2.
export interface ThemeColors {
  text: { primary: string; secondary: string; link: string };
  background: { secondary: string };
  border: { weak: string; medium: string; strong: string };
  primary: { main: string };
  error: { text: string };
}

export function themeColors(tokens: ThemeTokens): ThemeColors {
  return {
    text: { primary: tokens.fg.primary, secondary: tokens.fg.secondary, link: tokens.fg.link },
    background: { secondary: tokens.bg.surface },
    border: tokens.border,
    primary: { main: tokens.accent.primary },
    error: { text: tokens.status.error },
  };
}
