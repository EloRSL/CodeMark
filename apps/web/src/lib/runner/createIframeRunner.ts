import { RunnerRequest, RunnerResponse, type Runner, type RunResult } from '@codemark/contracts';

export function createIframeRunner(): Runner {
  const configuredOrigin: string | undefined = import.meta.env.VITE_RUNNER_ORIGIN;

  let session: Promise<HTMLIFrameElement> | undefined;
  let queue: Promise<void> = Promise.resolve();

  function getOrigin(): string {
    const value = configuredOrigin || (import.meta.env.DEV ? 'http://localhost:5174' : '');

    if (!value) {
      throw new Error('VITE_RUNNER_ORIGIN is missing');
    }

    const origin = new URL(value).origin;

    if (origin === window.location.origin) {
      throw new Error('Runner must use a different origin');
    }

    return origin;
  }

  function getFrame(origin: string): Promise<HTMLIFrameElement> {
    session ??= new Promise<HTMLIFrameElement>((resolve, reject) => {
      const iframe = document.createElement('iframe');

      iframe.hidden = true;
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.src = `${origin}/`;

      function cleanup(): void {
        window.removeEventListener('message', onMessage);
        iframe.removeEventListener('error', onError);
      }

      function onError(): void {
        cleanup();
        iframe.remove();
        reject(new Error('Runner iframe failed to load'));
      }

      function onMessage(event: MessageEvent<unknown>): void {
        if (event.origin !== origin || event.source !== iframe.contentWindow) {
          return;
        }

        const response = RunnerResponse.safeParse(event.data);

        if (!response.success || response.data.type !== 'ready') {
          return;
        }

        cleanup();
        resolve(iframe);
      }

      window.addEventListener('message', onMessage);
      iframe.addEventListener('error', onError);
      document.body.appendChild(iframe);
    }).catch((error: unknown) => {
      session = undefined;
      throw error;
    });

    return session;
  }

  async function runOnce(
    code: string,
    inputs: string[],
    timeLimitMs: number,
  ): Promise<RunResult[]> {
    const request = RunnerRequest.parse({
      type: 'run',
      requestId: crypto.randomUUID(),
      code,
      inputs,
      timeLimitMs,
    });

    const origin = getOrigin();
    const iframe = await getFrame(origin);
    const target = iframe.contentWindow;

    if (!target) {
      throw new Error('Runner iframe is unavailable');
    }

    return new Promise<RunResult[]>((resolve, reject) => {
      function cleanup(): void {
        window.removeEventListener('message', onMessage);
      }

      function onMessage(event: MessageEvent<unknown>): void {
        if (event.origin !== origin || event.source !== target) {
          return;
        }

        const parsed = RunnerResponse.safeParse(event.data);

        if (!parsed.success) {
          return;
        }

        const response = parsed.data;

        if (response.type === 'ready') {
          cleanup();
          reject(new Error('Runner reloaded during execution'));
          return;
        }

        if (
          response.requestId !== request.requestId &&
          !(response.type === 'error' && response.requestId === null)
        ) {
          return;
        }

        cleanup();

        if (response.type === 'error') {
          reject(new Error(`${response.code}: ${response.message}`));
          return;
        }

        if (response.results.length !== inputs.length) {
          reject(new Error('Unexpected number of runner results'));
          return;
        }

        resolve(response.results);
      }

      window.addEventListener('message', onMessage);

      try {
        target.postMessage(request, origin);
      } catch (error: unknown) {
        cleanup();
        reject(error);
      }
    });
  }

  return {
    run(code, inputs, timeLimitMs) {
      const result = queue.then(() => runOnce(code, inputs, timeLimitMs));

      queue = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}
