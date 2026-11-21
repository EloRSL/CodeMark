import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  // architecture.md section 5: when unset, VITE_DEMO_MODE is "true" in vite dev and "false" in builds.
  const demoMode =
    loadEnv(mode, '.', 'VITE_').VITE_DEMO_MODE ?? (command === 'serve' ? 'true' : 'false');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': '/src' } },
    define: { 'import.meta.env.VITE_DEMO_MODE': JSON.stringify(demoMode) },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': 'http://localhost:8787' },
    },
  };
});
