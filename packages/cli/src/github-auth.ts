import { execFileSync, spawnSync } from "node:child_process";
import { loadRepositoryConfig } from "./config";

export const COMMON_GH_EXECUTABLE_PATHS = [
  "/opt/homebrew/bin/gh",
  "/usr/local/bin/gh",
] as const;

type SpawnResult = {
  error?: Error;
  status?: number | null;
};

type SpawnCommand = (command: string, args: string[]) => SpawnResult;
type RunCommand = (command: string, args: string[]) => string;

export type GitHubCliResolutionSource =
  | "env"
  | "config"
  | "path"
  | "common-path";

export type GitHubCliAttempt = {
  path: string;
  source: GitHubCliResolutionSource;
  available: boolean;
  error?: string;
};

export type GitHubAuthDiagnostics = {
  ghTokenPresent: boolean;
  githubTokenPresent: boolean;
  ghCandidates: GitHubCliAttempt[];
  selectedGhPath?: string;
  selectedGhSource?: GitHubCliResolutionSource;
  tokenSource?: "GH_TOKEN" | "GITHUB_TOKEN" | "gh";
  ghTokenError?: string;
};

export type GitHubCliResolution = {
  path?: string;
  source?: GitHubCliResolutionSource;
  diagnostics: GitHubAuthDiagnostics;
};

function defaultSpawnCommand(command: string, args: string[]): SpawnResult {
  return spawnSync(command, args, { stdio: "ignore" });
}

function defaultRunCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token ? token : undefined;
}

function loadConfiguredGitHubCliPath(repoRoot: string | undefined): string | undefined {
  if (!repoRoot) {
    return undefined;
  }

  try {
    return loadRepositoryConfig(repoRoot)?.forge?.githubCliPath?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function uniqueCandidates(
  candidates: Array<{ path: string | undefined; source: GitHubCliResolutionSource }>
): Array<{ path: string; source: GitHubCliResolutionSource }> {
  const seen = new Set<string>();
  const unique: Array<{ path: string; source: GitHubCliResolutionSource }> = [];
  for (const candidate of candidates) {
    const path = candidate.path?.trim();
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    unique.push({ path, source: candidate.source });
  }

  return unique;
}

function renderSpawnError(result: SpawnResult): string | undefined {
  if (result.error?.message) {
    return result.error.message;
  }

  if (typeof result.status === "number") {
    return `exit ${result.status}`;
  }

  return undefined;
}

export function resolveGitHubCli(options: {
  configuredPath?: string;
  env?: Record<string, string | undefined>;
  repoRoot?: string;
  spawnSync?: SpawnCommand;
} = {}): GitHubCliResolution {
  const env = options.env ?? process.env;
  const spawn = options.spawnSync ?? defaultSpawnCommand;
  const configuredPath =
    options.configuredPath ?? loadConfiguredGitHubCliPath(options.repoRoot);
  const diagnostics: GitHubAuthDiagnostics = {
    ghTokenPresent: Boolean(normalizeToken(env.GH_TOKEN)),
    githubTokenPresent: Boolean(normalizeToken(env.GITHUB_TOKEN)),
    ghCandidates: [],
  };

  const candidates = uniqueCandidates([
    { path: env.PRS_GH_PATH ?? env.PRS_GITHUB_CLI_PATH, source: "env" },
    { path: configuredPath, source: "config" },
    { path: "gh", source: "path" },
    ...COMMON_GH_EXECUTABLE_PATHS.map((path) => ({
      path,
      source: "common-path" as const,
    })),
  ]);

  for (const candidate of candidates) {
    let result: SpawnResult;
    try {
      result = spawn(candidate.path, ["--version"]);
    } catch (error: unknown) {
      result = {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    const available = !result.error && result.status === 0;
    diagnostics.ghCandidates.push({
      ...candidate,
      available,
      error: available ? undefined : renderSpawnError(result),
    });

    if (available) {
      diagnostics.selectedGhPath = candidate.path;
      diagnostics.selectedGhSource = candidate.source;
      return {
        path: candidate.path,
        source: candidate.source,
        diagnostics,
      };
    }
  }

  return { diagnostics };
}

export function resolveGitHubToken(options: {
  configuredPath?: string;
  env?: Record<string, string | undefined>;
  repoRoot?: string;
  runCommand?: RunCommand;
  spawnSync?: SpawnCommand;
} = {}): { token?: string; diagnostics: GitHubAuthDiagnostics } {
  const env = options.env ?? process.env;
  const ghToken = normalizeToken(env.GH_TOKEN);
  const githubToken = normalizeToken(env.GITHUB_TOKEN);

  if (ghToken) {
    return {
      token: ghToken,
      diagnostics: {
        ghTokenPresent: true,
        githubTokenPresent: Boolean(githubToken),
        ghCandidates: [],
        tokenSource: "GH_TOKEN",
      },
    };
  }

  if (githubToken) {
    return {
      token: githubToken,
      diagnostics: {
        ghTokenPresent: false,
        githubTokenPresent: true,
        ghCandidates: [],
        tokenSource: "GITHUB_TOKEN",
      },
    };
  }

  const cli = resolveGitHubCli({
    configuredPath: options.configuredPath,
    env,
    repoRoot: options.repoRoot,
    spawnSync: options.spawnSync,
  });
  if (!cli.path) {
    return { diagnostics: cli.diagnostics };
  }

  try {
    const token = normalizeToken(
      (options.runCommand ?? defaultRunCommand)(cli.path, ["auth", "token"])
    );
    return {
      token,
      diagnostics: {
        ...cli.diagnostics,
        tokenSource: token ? "gh" : undefined,
      },
    };
  } catch (error: unknown) {
    return {
      diagnostics: {
        ...cli.diagnostics,
        ghTokenError: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function formatGitHubAuthDiagnostics(
  diagnostics: GitHubAuthDiagnostics
): string {
  const lines = [
    "GitHub auth diagnostics:",
    `- GH_TOKEN present: ${diagnostics.ghTokenPresent ? "yes" : "no"}`,
    `- GITHUB_TOKEN present: ${diagnostics.githubTokenPresent ? "yes" : "no"}`,
  ];

  if (diagnostics.tokenSource) {
    lines.push(`- token source: ${diagnostics.tokenSource}`);
  }

  if (diagnostics.selectedGhPath) {
    lines.push(
      `- selected gh: ${diagnostics.selectedGhPath} (${diagnostics.selectedGhSource})`
    );
  }

  if (diagnostics.ghCandidates.length > 0) {
    lines.push("- gh candidates tried:");
    for (const candidate of diagnostics.ghCandidates) {
      lines.push(
        `  - ${candidate.path} (${candidate.source}): ${
          candidate.available ? "available" : `unavailable${candidate.error ? `, ${candidate.error}` : ""}`
        }`
      );
    }
  }

  if (diagnostics.ghTokenError) {
    lines.push(`- gh auth token failed: ${diagnostics.ghTokenError}`);
  }

  return lines.join("\n");
}
