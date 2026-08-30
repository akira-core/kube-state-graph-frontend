export type DefaultLayout = 'fcose' | 'dagre';

export type ConfigTheme = 'dark' | 'light' | 'system';

export interface RuntimeEndpoints {
  graph?: string;
  codeChanges?: string;
  configChanges?: string;
  dashboard?: string;
}

export interface RuntimeConfig {
  endpoints: RuntimeEndpoints;
  demoMode: boolean;
  refreshIntervalSeconds: number;
  defaultLayout: DefaultLayout;
  theme: ConfigTheme;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  endpoints: {},
  demoMode: false,
  refreshIntervalSeconds: 0,
  defaultLayout: 'fcose',
  theme: 'system',
};
