import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        headless: true,
      },
    },
  ],

  webServer: [
    {
      command: `node -e "require('node:http').createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body></body></html>');}).listen(5173,'localhost')"`,
      url: 'http://localhost:5173/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @codemark/runner exec vite preview --port 5174 --strictPort',
      url: 'http://localhost:5174/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
