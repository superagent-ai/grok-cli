import { resolve } from "path";
import { BOOTSTRAP_GENERATOR_VERSION, hashFile, loadSeed, type ReseedTrigger, type SeedArtifact } from "./seed.js";

export interface StalenessResult {
  stale: boolean;
  trigger?: ReseedTrigger;
}

export function checkSeedStaleness(cwd: string, seed: SeedArtifact | null = loadSeed(cwd)): StalenessResult {
  if (!seed) {
    return { stale: true, trigger: { reason: "initial_missing", changedFiles: [] } };
  }

  if (seed.generatorVersion === BOOTSTRAP_GENERATOR_VERSION) {
    return {
      stale: true,
      trigger: { reason: "initial_missing", changedFiles: seed.keyFiles.map((file) => file.path) },
    };
  }

  const changed: string[] = [];
  for (const file of seed.keyFiles) {
    try {
      const current = hashFile(resolve(cwd, file.path));
      if (current !== file.hash) changed.push(file.path);
    } catch {
      changed.push(file.path);
    }
  }

  if (changed.length > 0) {
    return { stale: true, trigger: { reason: "key_file_changed", changedFiles: changed } };
  }

  return { stale: false };
}
