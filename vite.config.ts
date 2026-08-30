/// <reference types="vitest/config" />
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function sendDevConfig(res: ServerResponse): void {
  const localPath = path.join(rootDir, 'dev/config.local.json');
  const defaultPath = path.join(rootDir, 'dev/config.json');
  const filePath = fs.existsSync(localPath) ? localPath : defaultPath;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(filePath));
}

function isConfigJsonRequest(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  const pathname = url.split('?')[0] ?? '';
  return pathname === '/config.json';
}

function ksgDevConfigPlugin(): Plugin {
  return {
    name: 'ksg-dev-config',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (isConfigJsonRequest(req.url)) {
          sendDevConfig(res);
          return;
        }
        next();
      });
    },
  };
}

const proxyTarget = process.env.KSG_DEV_PROXY_TARGET;

export default defineConfig({
  plugins: [ksgDevConfigPlugin(), react()],
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    ...(proxyTarget !== undefined && proxyTarget !== ''
      ? {
          proxy: {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: (requestPath: string) => requestPath.replace(/^\/api/, ''),
            },
          },
        }
      : {}),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    },
  },
});
