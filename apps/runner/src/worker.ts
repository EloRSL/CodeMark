import { LIMITS, RunnerRequest, type RunnerResponse, type RunResult } from '@codemark/contracts';
import type { PyodideInterface } from 'pyodide';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

const pythonWrapper = `
import sys
import traceback

stdout = sys.stdout
stderr = sys.stderr
exit_code = 0

try:
    exec(
        compile(source, "<student>", "exec"),
        {"__name__": "__main__"}
    )
except SystemExit as error:
    if error.code is None:
        exit_code = 0
    elif isinstance(error.code, int):
        exit_code = int(error.code)
    else:
        print(error.code, file=stderr)
        exit_code = 1
except BaseException:
    traceback.print_exc(file=stderr)
    exit_code = 1
finally:
    stdout.flush()
    stderr.flush()

exit_code
`;

function createOutputBuffer() {
  const buffer = new Uint8Array(LIMITS.storedOutputBytes);
  let length = 0;

  return {
    write(bytes: Uint8Array): number {
      const count = Math.min(bytes.length, buffer.length - length);

      buffer.set(bytes.subarray(0, count), length);
      length += count;

      return bytes.length;
    },

    text(): string {
      return (
        decoder.decode(buffer.subarray(0, length), { stream: true }) +
        decoder.decode().replace(/\uFFFD$/, '')
      );
    },
  };
}

function runInput(pyodide: PyodideInterface, code: string, input: string): RunResult {
  const inputBytes = encoder.encode(input);
  let inputPosition = 0;

  const stdout = createOutputBuffer();
  const stderr = createOutputBuffer();

  pyodide.setStdin({
    read(buffer: Uint8Array): number {
      const count = Math.min(buffer.length, inputBytes.length - inputPosition);

      buffer.set(inputBytes.subarray(inputPosition, inputPosition + count));

      inputPosition += count;
      return count;
    },
  });

  pyodide.setStdout({ write: stdout.write });
  pyodide.setStderr({ write: stderr.write });

  const globals = pyodide.toPy({ source: code });
  const startedAt = performance.now();

  try {
    const result: unknown = pyodide.runPython(pythonWrapper, { globals });

    const exitCode = typeof result === 'number' || typeof result === 'bigint' ? Number(result) : 1;

    return {
      stdout: stdout.text(),
      stderr: stderr.text(),
      exitCode: Number.isFinite(exitCode) ? exitCode : 1,
      timedOut: false,
      durationMs: performance.now() - startedAt,
    };
  } finally {
    globals.destroy();
  }
}

async function initialize(port: MessagePort): Promise<void> {
  const send = port.postMessage.bind(port);

  function reply(response: RunnerResponse): void {
    send(response);
  }

  try {
    const moduleUrl = new URL('/pyodide.mjs', self.location.origin).href;

    const { loadPyodide } = (await import(
      /* @vite-ignore */ moduleUrl
    )) as typeof import('pyodide');

    const pyodide = await loadPyodide({
      indexURL: `${self.location.origin}/`,
    });

    port.onmessage = (event: MessageEvent<unknown>) => {
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

      const request = parsed.data;

      try {
        const results = request.inputs.map((input) => runInput(pyodide, request.code, input));

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
      }
    };

    reply({
      type: 'ready',
      pyodideVersion: pyodide.version,
    });
  } catch (error: unknown) {
    reply({
      type: 'error',
      requestId: null,
      code: 'RUNNER_CRASHED',
      message: String(error),
    });
  }
}

self.addEventListener(
  'message',
  (event: MessageEvent) => {
    const port = event.ports[0];

    if (port) {
      void initialize(port);
    }
  },
  { once: true },
);
