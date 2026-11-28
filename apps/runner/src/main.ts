/// <reference types="vite/client" />

import { RunnerRequest, RunnerResponse, type RunResult } from '@codemark/contracts';

const appOrigin: string = import.meta.env.VITE_APP_ORIGIN;
const pyodideVersion: string = import.meta.env.VITE_PYODIDE_VERSION;

let busy = false;

function reply(response: RunnerResponse): void {
  window.parent.postMessage(response, appOrigin);
}

async function createWorkerSession() {
  const startedAt = performance.now();
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  const channel = new MessageChannel();
  const port = channel.port1;

  let failure: Error | undefined;
  let rejectPending: ((error: Error) => void) | undefined;

  function fail(message: string): void {
    failure = new Error(message);
    rejectPending?.(failure);
  }

  worker.addEventListener('error', () => {
    fail('Runner worker crashed');
  });

  worker.addEventListener('messageerror', () => {
    fail('Invalid worker message');
  });

  port.addEventListener('messageerror', () => {
    fail('Invalid runner response');
  });

  function close(): void {
    worker.terminate();
    port.close();
  }

  function exchange(send: () => void, timeLimitMs?: number): Promise<RunnerResponse | null> {
    return new Promise((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;

      function cleanup(): void {
        clearTimeout(timer);
        port.onmessage = null;
        rejectPending = undefined;
      }

      function complete(response: RunnerResponse | null): void {
        cleanup();
        resolve(response);
      }

      function rejectExchange(error: Error): void {
        cleanup();
        reject(error);
      }

      rejectPending = rejectExchange;

      port.onmessage = (event: MessageEvent<unknown>) => {
        const parsed = RunnerResponse.safeParse(event.data);

        if (!parsed.success) {
          rejectExchange(new Error('Invalid runner response'));
          return;
        }

        complete(parsed.data);
      };

      if (timeLimitMs !== undefined) {
        timer = setTimeout(() => complete(null), timeLimitMs);
      }

      try {
        send();
      } catch (error: unknown) {
        rejectExchange(new Error(String(error)));
      }
    });
  }

  try {
    const ready = await exchange(() => {
      worker.postMessage(null, [channel.port2]);
    });

    if (ready?.type !== 'ready') {
      throw new Error(ready?.type === 'error' ? ready.message : 'Worker initialization failed');
    }
    // Measure interpreter startup time
    performance.clearMeasures('codemark.runner.startup');
    performance.measure('codemark.runner.startup', {
      start: startedAt,
      end: performance.now(),
    });
    return {
      close,

      run(request: RunnerRequest, input: string) {
        return exchange(() => {
          port.postMessage({
            ...request,
            inputs: [input],
          });
        }, request.timeLimitMs);
      },
    };
  } catch (error: unknown) {
    close();
    throw error;
  }
}

async function runRequest(request: RunnerRequest): Promise<void> {
  const results: RunResult[] = [];

  let session: Awaited<ReturnType<typeof createWorkerSession>> | undefined;

  try {
    session = await createWorkerSession();

    for (const input of request.inputs) {
      session ??= await createWorkerSession();

      const response = await session.run(request, input);

      if (response === null) {
        session.close();
        session = undefined;

        results.push({
          stdout: '',
          stderr: '',
          exitCode: -1,
          timedOut: true,
          durationMs: request.timeLimitMs,
        });

        continue;
      }

      if (response.type === 'error') {
        throw new Error(response.message);
      }

      if (
        response.type !== 'result' ||
        response.requestId !== request.requestId ||
        response.results.length !== 1
      ) {
        throw new Error('Unexpected runner response');
      }

      const result = response.results[0];

      if (result === undefined) {
        throw new Error('Missing runner result');
      }

      results.push(result);
    }

    reply({
      type: 'result',
      requestId: request.requestId,
      results,
    });
  } catch (error: unknown) {
    reply({
      type: 'error',
      requestId: request.requestId,
      code: 'RUNNER_CRASHED',
      message: String(error),
    });
  } finally {
    session?.close();
    busy = false;
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== appOrigin || event.source !== window.parent) {
    return;
  }

  const parsed = RunnerRequest.safeParse(event.data);

  if (!parsed.success) {
    reply({
      type: 'error',
      requestId: null,
      code: 'BAD_REQUEST',
      message: 'Invalid runner request',
    });

    return;
  }

  if (busy) {
    reply({
      type: 'error',
      requestId: parsed.data.requestId,
      code: 'BAD_REQUEST',
      message: 'Runner is busy',
    });

    return;
  }

  busy = true;
  void runRequest(parsed.data);
});

reply({
  type: 'ready',
  pyodideVersion,
});
