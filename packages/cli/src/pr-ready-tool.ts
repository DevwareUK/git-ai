import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { formatRunTimestamp, toRepoRelativePath } from "./run-artifacts";
import type { PullRequestDetails, RepositoryForge } from "./forge";

export type PrReadyRunCommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type PrReadyRuntime =
  | {
      kind: "ddev";
      status: "detected" | "not-started" | "running" | "failed";
      startCommand: string[];
      url?: string;
      message?: string;
    }
  | {
      kind: "unknown";
      status: "not-detected";
      message: string;
    };

export type PrReadyBaseSync =
  | {
      status: "up-to-date";
      baseRefName: string;
      remoteRef: string;
      baseTip: string;
      summary: string;
    }
  | {
      status: "behind";
      baseRefName: string;
      remoteRef: string;
      baseTip: string;
      summary: string;
    }
  | {
      status: "merged";
      baseRefName: string;
      remoteRef: string;
      baseTip: string;
      summary: string;
    }
  | {
      status: "blocked";
      baseRefName: string;
      remoteRef: string;
      baseTip: string;
      summary: string;
    };

export type PrReadyToolResult =
  | {
      status: "ready";
      prNumber: number;
      title: string;
      url: string;
      branchName: string;
      runDir: string;
      metadataFilePath: string;
      baseSync: PrReadyBaseSync;
      runtime: PrReadyRuntime;
      nextAction: "browse-local-app";
    }
  | {
      status: "needs-action";
      prNumber: number;
      title: string;
      url: string;
      branchName: string;
      runDir: string;
      metadataFilePath: string;
      baseSync: PrReadyBaseSync;
      runtime: PrReadyRuntime;
      nextAction: "confirm-sync-base" | "start-runtime";
    }
  | {
      status: "blocked";
      reason: "merge-conflicts" | "runtime-start-failed";
      prNumber: number;
      title: string;
      url: string;
      branchName: string;
      runDir: string;
      metadataFilePath: string;
      baseSync: PrReadyBaseSync;
      runtime: PrReadyRuntime;
      nextAction: "resolve-conflicts" | "start-runtime-manually";
    };

type PrReadyToolOptions = {
  all: boolean;
  buildCommand: string[];
  ensureCleanWorkingTree: (repoRoot: string) => void;
  ensureVerificationCommandAvailable: (
    repoRoot: string,
    buildCommand: string[],
    workflowName: string
  ) => void;
  forge: RepositoryForge;
  prNumber: number;
  repoRoot: string;
  runCommand?: (command: string, args: string[]) => PrReadyRunCommandResult;
};

function defaultRunCommand(command: string, args: string[]): PrReadyRunCommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function createRunDir(repoRoot: string, prNumber: number): string {
  const runDir = resolve(
    repoRoot,
    ".prs",
    "runs",
    `${formatRunTimestamp()}-pr-${prNumber}-ready`
  );
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

function git(
  runCommand: (command: string, args: string[]) => PrReadyRunCommandResult,
  repoRoot: string,
  args: string[]
): PrReadyRunCommandResult {
  return runCommand("git", ["-C", repoRoot, ...args]);
}

function ensureSuccess(result: PrReadyRunCommandResult, message: string): void {
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(detail ? `${message} ${detail}` : message);
  }
}

function isBranchCheckedOutInAnotherWorktree(result: PrReadyRunCommandResult): boolean {
  const output = `${result.stderr}\n${result.stdout}`;
  return /already checked out at|is already used by worktree/i.test(output);
}

function reviewBranchNameForPullRequest(pullRequest: PullRequestDetails): string {
  return `review/pr-${pullRequest.number}`;
}

function checkoutPullRequestBranch(
  runCommand: (command: string, args: string[]) => PrReadyRunCommandResult,
  repoRoot: string,
  pullRequest: PullRequestDetails
): string {
  const branchExists = git(runCommand, repoRoot, [
    "rev-parse",
    "--verify",
    `refs/heads/${pullRequest.headRefName}`,
  ]);

  if (branchExists.status !== 0) {
    ensureSuccess(
      git(runCommand, repoRoot, [
        "fetch",
        "origin",
        `refs/pull/${pullRequest.number}/head:refs/heads/${pullRequest.headRefName}`,
      ]),
      `Failed to fetch PR #${pullRequest.number} into local branch "${pullRequest.headRefName}".`
    );
  }

  const checkoutResult = git(runCommand, repoRoot, ["checkout", pullRequest.headRefName]);
  if (checkoutResult.status !== 0) {
    if (isBranchCheckedOutInAnotherWorktree(checkoutResult)) {
      const reviewBranchName = reviewBranchNameForPullRequest(pullRequest);
      ensureSuccess(
        git(runCommand, repoRoot, [
          "fetch",
          "origin",
          `+refs/pull/${pullRequest.number}/head:refs/heads/${reviewBranchName}`,
        ]),
        `Failed to fetch PR #${pullRequest.number} into local review branch "${reviewBranchName}".`
      );
      ensureSuccess(
        git(runCommand, repoRoot, ["checkout", reviewBranchName]),
        `Failed to check out local review branch "${reviewBranchName}".`
      );
      return reviewBranchName;
    }
    ensureSuccess(
      checkoutResult,
      `Failed to check out PR branch "${pullRequest.headRefName}".`
    );
  }
  return pullRequest.headRefName;
}

function detectRuntime(repoRoot: string): PrReadyRuntime {
  const ddevConfigPath = resolve(repoRoot, ".ddev", "config.yaml");
  if (!existsSync(ddevConfigPath)) {
    return {
      kind: "unknown",
      status: "not-detected",
      message:
        "No DDEV runtime was detected. Start the app with the repository's normal local runtime.",
    };
  }

  const config = readFileSync(ddevConfigPath, "utf8");
  const name = config.match(/^name:\s*([A-Za-z0-9_.-]+)/m)?.[1];
  return {
    kind: "ddev",
    status: "detected",
    startCommand: ["ddev", "start"],
    url: name ? `https://${name}.ddev.site` : undefined,
  };
}

function startRuntime(
  runCommand: (command: string, args: string[]) => PrReadyRunCommandResult,
  runtime: PrReadyRuntime
): PrReadyRuntime {
  if (runtime.kind !== "ddev") {
    return runtime;
  }

  const result = runCommand("ddev", ["start"]);
  if (result.status !== 0) {
    return {
      ...runtime,
      status: "failed",
      message: result.stderr.trim() || result.stdout.trim() || "ddev start failed.",
    };
  }

  return {
    ...runtime,
    status: "running",
  };
}

function fetchBaseState(
  runCommand: (command: string, args: string[]) => PrReadyRunCommandResult,
  repoRoot: string,
  pullRequest: PullRequestDetails,
  branchName: string,
  all: boolean
): PrReadyBaseSync {
  const remoteRef = `origin/${pullRequest.baseRefName}`;
  ensureSuccess(
    git(runCommand, repoRoot, ["fetch", "origin", pullRequest.baseRefName]),
    `Failed to fetch latest ${remoteRef}.`
  );

  const baseTipResult = git(runCommand, repoRoot, ["rev-parse", remoteRef]);
  ensureSuccess(baseTipResult, `Failed to resolve ${remoteRef}.`);
  const baseTip = baseTipResult.stdout.trim();

  const containsBase = git(runCommand, repoRoot, [
    "merge-base",
    "--is-ancestor",
    baseTip,
    "HEAD",
  ]);

  if (containsBase.status === 0) {
    return {
      status: "up-to-date",
      baseRefName: pullRequest.baseRefName,
      remoteRef,
      baseTip,
      summary: `"${branchName}" already contains ${remoteRef} tip ${baseTip}.`,
    };
  }

  if (!all) {
    return {
      status: "behind",
      baseRefName: pullRequest.baseRefName,
      remoteRef,
      baseTip,
      summary: `"${branchName}" does not contain ${remoteRef} tip ${baseTip}.`,
    };
  }

  const mergeResult = git(runCommand, repoRoot, ["merge", "--no-edit", "--no-ff", remoteRef]);
  if (mergeResult.status !== 0) {
    return {
      status: "blocked",
      baseRefName: pullRequest.baseRefName,
      remoteRef,
      baseTip,
      summary: `Merging ${remoteRef} into "${branchName}" produced conflicts.`,
    };
  }

  return {
    status: "merged",
    baseRefName: pullRequest.baseRefName,
    remoteRef,
    baseTip,
    summary: `Merged ${remoteRef} tip ${baseTip} into "${branchName}".`,
  };
}

function writeMetadata(
  repoRoot: string,
  metadataFilePath: string,
  result: PrReadyToolResult
): void {
  writeFileSync(
    metadataFilePath,
    `${JSON.stringify(
      {
        ...result,
        runDir: toRepoRelativePath(repoRoot, result.runDir),
        metadataFilePath: toRepoRelativePath(repoRoot, result.metadataFilePath),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function readyPullRequestTool(
  options: PrReadyToolOptions
): Promise<PrReadyToolResult> {
  if (options.forge.type === "none") {
    throw new Error(
      "Repository forge support is disabled by .prs/config.json. Configure `forge.type` to enable pull request workflows."
    );
  }

  options.ensureCleanWorkingTree(options.repoRoot);
  options.ensureVerificationCommandAvailable(
    options.repoRoot,
    options.buildCommand,
    "prs tool pr ready"
  );

  const runCommand = options.runCommand ?? defaultRunCommand;
  const pullRequest = await options.forge.fetchPullRequestDetails(options.prNumber);
  const runDir = createRunDir(options.repoRoot, pullRequest.number);
  const metadataFilePath = resolve(runDir, "metadata.json");
  const branchName = checkoutPullRequestBranch(runCommand, options.repoRoot, pullRequest);
  const runtime = detectRuntime(options.repoRoot);
  const baseSync = fetchBaseState(
    runCommand,
    options.repoRoot,
    pullRequest,
    branchName,
    options.all
  );

  let result: PrReadyToolResult;
  if (baseSync.status === "blocked") {
    result = {
      status: "blocked",
      reason: "merge-conflicts",
      prNumber: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      branchName,
      runDir,
      metadataFilePath,
      baseSync,
      runtime:
        runtime.kind === "ddev" ? { ...runtime, status: "not-started" } : runtime,
      nextAction: "resolve-conflicts",
    };
    writeMetadata(options.repoRoot, metadataFilePath, result);
    return result;
  }

  if (baseSync.status === "behind") {
    result = {
      status: "needs-action",
      prNumber: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      branchName,
      runDir,
      metadataFilePath,
      baseSync,
      runtime,
      nextAction: "confirm-sync-base",
    };
    writeMetadata(options.repoRoot, metadataFilePath, result);
    return result;
  }

  const startedRuntime = options.all ? startRuntime(runCommand, runtime) : runtime;
  if (startedRuntime.kind === "ddev" && startedRuntime.status === "failed") {
    result = {
      status: "blocked",
      reason: "runtime-start-failed",
      prNumber: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      branchName,
      runDir,
      metadataFilePath,
      baseSync,
      runtime: startedRuntime,
      nextAction: "start-runtime-manually",
    };
    writeMetadata(options.repoRoot, metadataFilePath, result);
    return result;
  }

  if (!options.all && startedRuntime.kind === "ddev") {
    result = {
      status: "needs-action",
      prNumber: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      branchName,
      runDir,
      metadataFilePath,
      baseSync,
      runtime: startedRuntime,
      nextAction: "start-runtime",
    };
    writeMetadata(options.repoRoot, metadataFilePath, result);
    return result;
  }

  result = {
    status: "ready",
    prNumber: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    branchName,
    runDir,
    metadataFilePath,
    baseSync,
    runtime: startedRuntime,
    nextAction: "browse-local-app",
  };
  writeMetadata(options.repoRoot, metadataFilePath, result);
  return result;
}
