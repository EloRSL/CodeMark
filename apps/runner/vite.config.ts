import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const require = createRequire(import.meta.url);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const appOrigin = env.VITE_APP_ORIGIN || 'http://localhost:5173';

  const pyodideDir = dirname(require.resolve('pyodide'));
  const manifest = JSON.parse(readFileSync(join(pyodideDir, 'package.json'), 'utf8')) as {
    version: string;
  };

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "connect-src 'self'",
    "worker-src 'self'",
    `frame-ancestors ${appOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  return {
    publicDir: pyodideDir,

    server: {
      port: 5174,
      strictPort: true,
      headers: {
        'Content-Security-Policy': csp,
      },
    },

    preview: {
      headers: {
        'Content-Security-Policy': csp,
      },
    },

    define: {
      'import.meta.env.VITE_APP_ORIGIN': JSON.stringify(appOrigin),
      'import.meta.env.VITE_PYODIDE_VERSION': JSON.stringify(manifest.version),
    },

    optimizeDeps: {
      exclude: ['pyodide'],
    },

    plugins: [
      {
        name: 'runner-security-headers',
        apply: 'build',

        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: '_headers',
            source: `/*\n  Content-Security-Policy: ${csp}\n`,
          });
        },
      },
    ],
  };
});
