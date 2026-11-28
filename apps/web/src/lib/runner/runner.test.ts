// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunnerRequest } from '@codemark/contracts';
import { createFakeRunner } from './createFakeRunner';
import { createIframeRunner } from './createIframeRunner';

afterEach(() => {
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('createFakeRunner', () => {
  it('echoes each input without executing code', async () => {
    const runner = createFakeRunner();

    const results = await runner.run('print("ignored")', ['Hello', 'čšž'], 2000);

    expect(results).toEqual([
      {
        stdout: 'Hello',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
      },
      {
        stdout: 'čšž',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
      },
    ]);
  });

  it('returns no results for empty inputs', async () => {
    const runner = createFakeRunner();

    expect(await runner.run('', [], 2000)).toEqual([]);
  });
});

describe('createIframeRunner', () => {
  it('validates origin, source and request ID', async () => {
    const origin = 'http://localhost:5174';

    vi.stubEnv('VITE_RUNNER_ORIGIN', origin);

    const runner = createIframeRunner();
    const pending = runner.run('print("Hello")', [''], 2000);

    await vi.waitFor(() => {
      expect(document.querySelector('iframe')).not.toBeNull();
    });

    const iframe = document.querySelector('iframe');
    const target = iframe?.contentWindow;

    if (!iframe || !target) {
      throw new Error('Runner iframe is missing');
    }

    expect(iframe.hidden).toBe(true);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');

    const post = vi.spyOn(target, 'postMessage').mockImplementation(() => {});

    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source: target,
        data: {
          type: 'ready',
          pyodideVersion: '314.0.8',
        },
      }),
    );

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1);
    });

    const request = RunnerRequest.parse(post.mock.calls[0]?.[0]);

    expect(post).toHaveBeenCalledWith(request, origin);

    const result = {
      stdout: 'Hello\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      durationMs: 1,
    };

    const response = {
      type: 'result',
      requestId: request.requestId,
      results: [result],
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://example.com',
        source: target,
        data: { ...response, results: [] },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source: window,
        data: { ...response, results: [] },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source: target,
        data: { ...response, requestId: 'wrong-id' },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source: target,
        data: response,
      }),
    );

    expect(await pending).toEqual([result]);
  });
});
