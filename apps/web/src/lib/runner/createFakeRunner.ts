
import type { Runner } from '@codemark/contracts';

export function createFakeRunner(): Runner {
  return {
    async run(_code, inputs) {
      return inputs.map((input) => ({
        stdout: input,
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
      }));
    },
  };
}
