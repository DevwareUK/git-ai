import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

let cachedStartDir: string | undefined;
let cachedRepoRoot: string | undefined;

export function resolveRuntimeRepoRoot(startDir = process.cwd()): string {
  if (cachedStartDir === startDir && cachedRepoRoot) {
    return cachedRepoRoot;
  }

  try {
    const repoRoot = execFileSync("git", ["-C", startDir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    cachedStartDir = startDir;
    cachedRepoRoot = repoRoot;
    return repoRoot;
  } catch {
    const fallbackRoot = resolve(startDir);
    cachedStartDir = startDir;
    cachedRepoRoot = fallbackRoot;
    return fallbackRoot;
  }
}
