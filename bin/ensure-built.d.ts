export function isSourceCheckout(root: string): boolean;

export function findLocalTsc(root: string): string | null;

export function shouldRebuild(root: string, options?: { env?: NodeJS.ProcessEnv }): { needed: boolean; reason: string };

export function ensureBuilt(
  root: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    runBuild?: (root: string) => { status?: number | null };
  },
): { rebuilt: boolean; reason: string; status: number };
