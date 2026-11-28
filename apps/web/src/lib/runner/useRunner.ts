import type { Runner } from '@codemark/contracts';
import { createIframeRunner } from './createIframeRunner';

let sharedRunner: Runner | undefined;

export function useRunner(): Runner {
  sharedRunner ??= createIframeRunner();

  return sharedRunner;
}
