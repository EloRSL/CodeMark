import { expect, test, type Page } from '@playwright/test';

import { LIMITS, RunnerResponse, type RunnerRequest } from '@codemark/contracts';

const appOrigin = 'http://localhost:5173';
const runnerOrigin = 'http://localhost:5174';

test.describe.configure({ timeout: 60_000 });

async function run(
  page: Page,
  code: string,
  inputs: string[],
  timeLimitMs: number = LIMITS.timeLimitMs.default,
): Promise<RunnerResponse> {
  const request: RunnerRequest = {
    type: 'run',
    requestId: crypto.randomUUID(),
    code,
    inputs,
    timeLimitMs,
  };

  const response = await page.evaluate(
    ({ request, runnerOrigin }) => {
      return new Promise<unknown>((resolve, reject) => {
        const frame = document.querySelector<HTMLIFrameElement>('#runner');

        const target = frame?.contentWindow;

        if (!target) {
          reject(new Error('Runner iframe is missing'));
          return;
        }

        function onMessage(event: MessageEvent): void {
          if (
            event.origin !== runnerOrigin ||
            event.source !== target ||
            event.data?.requestId !== request.requestId
          ) {
            return;
          }

          window.removeEventListener('message', onMessage);
          resolve(event.data);
        }

        window.addEventListener('message', onMessage);
        target.postMessage(request, runnerOrigin);
      });
    },
    { request, runnerOrigin },
  );

  return RunnerResponse.parse(response);
}

test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    console.log(`[Browser ${message.type()}] ${message.text()}`);
  });

  page.on('pageerror', (error) => {
    console.log('[Page error]', error.message);
  });

  page.on('requestfailed', (request) => {
    console.log('[Request failed]', request.url(), request.failure()?.errorText);
  });

  page.on('framenavigated', (frame) => {
    console.log('[Frame]', frame.url());
  });

  page.on('response', (response) => {
    console.log('[HTTP]', response.status(), response.url());
  });

  await page.goto(`${appOrigin}/`);

  const ready = await page.evaluate((runnerOrigin) => {
    return new Promise<unknown>((resolve) => {
      const frame = document.createElement('iframe');

      frame.id = 'runner';
      frame.hidden = true;
      frame.src = `${runnerOrigin}/`;

      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');

      function onMessage(event: MessageEvent): void {
        if (
          event.origin !== runnerOrigin ||
          event.source !== frame.contentWindow ||
          event.data?.type !== 'ready'
        ) {
          return;
        }

        window.removeEventListener('message', onMessage);
        resolve(event.data);
      }

      window.addEventListener('message', onMessage);
      document.body.append(frame);
    });
  }, runnerOrigin);

  expect(ready).toMatchObject({
    type: 'ready',
    pyodideVersion: '314.0.8',
  });
});

test('runs Python with standard input and Unicode output', async ({ page }) => {
  const response = await run(page, 'a = int(input())\nb = int(input())\nprint(a + b, "čšž")', [
    '5\n7\n',
    '10\n20\n',
  ]);

  expect(response).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: '12 čšž\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      },
      {
        stdout: '30 čšž\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      },
    ],
  });
});

test('reports Python exceptions and exit codes', async ({ page }) => {
  const exception = await run(page, 'print(1 / 0)', ['']);

  expect(exception).toMatchObject({
    type: 'result',
    results: [
      {
        exitCode: 1,
        timedOut: false,
        stderr: expect.stringContaining('ZeroDivisionError'),
      },
    ],
  });

  const exit = await run(page, 'import sys\nsys.exit(3)', ['']);

  expect(exit).toMatchObject({
    type: 'result',
    results: [
      {
        exitCode: 3,
        timedOut: false,
      },
    ],
  });
});

test('stops an infinite loop and runs the remaining input', async ({ page }) => {
  const response = await run(
    page,
    [
      'value = input()',
      'if value == "hang":',
      '    while True:',
      '        pass',
      'else:',
      '    print(value)',
    ].join('\n'),
    ['hang\n', 'ok\n'],
    LIMITS.timeLimitMs.min,
  );

  expect(response).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: '',
        stderr: '',
        exitCode: -1,
        timedOut: true,
        durationMs: LIMITS.timeLimitMs.min,
      },
      {
        stdout: 'ok\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      },
    ],
  });
});

test('isolates globals, builtins and files between requests', async ({ page }) => {
  const first = await run(
    page,
    [
      'import builtins',
      'secret_variable = 123',
      'builtins.codemark_test = 456',
      'with open("/tmp/codemark-test.txt", "w") as f:',
      '    f.write("test")',
      'print("created")',
    ].join('\n'),
    [''],
  );

  expect(first).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: 'created\n',
        exitCode: 0,
        timedOut: false,
      },
    ],
  });

  const second = await run(
    page,
    [
      'import builtins',
      'import os',
      'print("secret_variable" in globals())',
      'print(hasattr(builtins, "codemark_test"))',
      'print(os.path.exists("/tmp/codemark-test.txt"))',
    ].join('\n'),
    [''],
  );

  expect(second).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: 'False\nFalse\nFalse\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      },
    ],
  });
});

test('blocks external network access through urllib', async ({ page }) => {
  const response = await run(
    page,
    [
      'import urllib.request',
      'try:',
      `    urllib.request.urlopen("${appOrigin}/network-probe", timeout=2)`,
      'except Exception:',
      '    print("blocked")',
      'else:',
      '    print("network available")',
    ].join('\n'),
    [''],
    LIMITS.timeLimitMs.max,
  );

  expect(response).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: 'blocked\n',
        exitCode: 0,
        timedOut: false,
      },
    ],
  });
});

test('blocks cross-origin fetch through CSP', async ({ page }) => {
  const url = `${appOrigin}/fetch-probe`;

  const { promise: unblock, resolve: release } = Promise.withResolvers<void>();

  await page.context().route('**/pyodide.mjs', async (route) => {
    await unblock;
    await route.continue();
  });

  const workerPromise = page.waitForEvent('worker');

  const responsePromise = run(
    page,
    ['from js import fetch', `fetch("${url}")`, 'print("fetch attempted")'].join('\n'),
    [''],
  );

  try {
    const worker = await workerPromise;

    const result = await worker.evaluate(async (url) => {
      const violation = new Promise<string>((resolve) => {
        self.addEventListener(
          'securitypolicyviolation',
          (event) => {
            const violationEvent = event as SecurityPolicyViolationEvent;

            resolve(violationEvent.effectiveDirective);
          },
          { once: true },
        );

        setTimeout(() => resolve('missing'), 3000);
      });

      const localResponse = await fetch('/pyodide-lock.json');

      let blocked = false;

      try {
        await fetch(url, { mode: 'no-cors' });
      } catch {
        blocked = true;
      }

      return {
        localAccess: localResponse.ok,
        blocked,
        directive: await violation,
      };
    }, url);

    expect(result).toEqual({
      localAccess: true,
      blocked: true,
      directive: 'connect-src',
    });
  } finally {
    release();
  }

  const response = await responsePromise;

  expect(response).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: 'fetch attempted\n',
        exitCode: 0,
        timedOut: false,
      },
    ],
  });
});

test('ignores messages from the wrong origin', async ({ page }) => {
  const request: RunnerRequest = {
    type: 'run',
    requestId: 'wrong-origin-test',
    code: 'print("unexpected execution")',
    inputs: [''],
    timeLimitMs: LIMITS.timeLimitMs.default,
  };

  const workers: string[] = [];

  page.on('worker', (worker) => {
    workers.push(worker.url());
  });

  const frame = page.frame({
    url: `${runnerOrigin}/`,
  });

  if (!frame) {
    throw new Error('Runner iframe is missing');
  }

  await frame.evaluate(
    ({ request, runnerOrigin }) => {
      window.postMessage(request, runnerOrigin);
    },
    { request, runnerOrigin },
  );

  await page.waitForTimeout(500);

  expect(workers).toHaveLength(0);

  const response = await run(page, 'print("valid request")', ['']);

  expect(response).toMatchObject({
    type: 'result',
    results: [
      {
        stdout: 'valid request\n',
        exitCode: 0,
      },
    ],
  });
});

test('reports a runner initialization failure', async ({ page }) => {
  await page.context().route('**/pyodide.mjs', (route) => route.abort());

  const response = await run(page, 'print("hello")', ['']);

  expect(response).toMatchObject({
    type: 'error',
    code: 'RUNNER_CRASHED',
    message: expect.any(String),
  });
});

test('reports an unexpected worker crash', async ({ page }) => {
  await page.context().route(/\/assets\/worker-[^/]+\.js$/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
          self.addEventListener('message', (event) => {
            const port = event.ports[0];

            port.onmessage = () => {
              throw new Error('Simulated worker crash');
            };

            port.postMessage({
              type: 'ready',
              pyodideVersion: '314.0.8'
            });
          });
        `,
    }),
  );

  const response = await run(page, 'print("hello")', ['']);

  expect(response).toMatchObject({
    type: 'error',
    code: 'RUNNER_CRASHED',
    message: expect.any(String),
  });
});

test('measures fresh interpreter startup time', async ({ page }) => {
  const samples: number[] = [];

  const frame = page.frame({
    url: `${runnerOrigin}/`,
  });

  if (!frame) {
    throw new Error('Runner iframe is missing');
  }

  for (let i = 0; i < 5; i++) {
    const response = await run(page, 'print("ready")', ['']);

    expect(response).toMatchObject({
      type: 'result',
      results: [
        {
          stdout: 'ready\n',
          exitCode: 0,
          timedOut: false,
        },
      ],
    });

    const duration = await frame.evaluate(() => {
      const entries = performance.getEntriesByName('codemark.runner.startup', 'measure');

      return entries.at(-1)?.duration ?? null;
    });

    if (duration === null) {
      throw new Error('Startup measurement is missing');
    }

    expect(duration).toBeGreaterThan(0);
    samples.push(duration);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (median === undefined) {
    throw new Error('Median is missing');
  }

  console.log('\n--- Pyodide startup benchmark ---');

  samples.forEach((duration, index) => {
    console.log(`Run ${index + 1}: ${duration.toFixed(2)} ms`);
  });

  console.log(`Minimum: ${Math.min(...samples).toFixed(2)} ms`);
  console.log(`Maximum: ${Math.max(...samples).toFixed(2)} ms`);
  console.log(`Median: ${median.toFixed(2)} ms`);
  console.log('---------------------------------\n');
});
