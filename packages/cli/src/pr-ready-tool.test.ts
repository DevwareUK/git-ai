import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PullRequestDetails, RepositoryForge } from "./forge";
import { readyPullRequestTool } from "./pr-ready-tool";

const cleanupTargets = new Set<string>();

afterEach(() => {
  for (const target of cleanupTargets) {
    rmSync(target, { recursive: true, force: true });
  }
  cleanupTargets.clear();
});

function createRepo(): string {
  const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-pr-ready-"));
  cleanupTargets.add(repoRoot);
  return repoRoot;
}

function createPullRequest(): PullRequestDetails {
  return {
    number: 115,
    title: "Add sale menu images",
    body: "Make the sale menu browsable with images.",
    url: "https://github.com/DevwareUK/bos/pull/115",
    baseRefName: "main",
    headRefName: "codex/sales-menu-images",
  };
}

function createForge(): RepositoryForge {
  return {
    type: "github",
    isAuthenticated: () => true,
    fetchIssueDetails: vi.fn(),
    fetchIssueComments: vi.fn(),
    fetchIssuePlanComment: vi.fn(),
    fetchAuditComment: vi.fn(),
    fetchPullRequestDetails: vi.fn().mockResolvedValue(createPullRequest()),
    listOpenPullRequestChanges: vi.fn(),
    fetchPullRequestIssueComments: vi.fn(),
    fetchPullRequestReviewComments: vi.fn(),
    createIssuePlanComment: vi.fn(),
    createAuditComment: vi.fn(),
    updateIssuePlanComment: vi.fn(),
    updateIssueComment: vi.fn(),
    createDraftIssue: vi.fn(),
    updateIssue: vi.fn(),
    createOrReuseIssue: vi.fn(),
    createPullRequest: vi.fn(),
  };
}

function createCommandRecorder(options: {
  containsBase: boolean;
  lockedHeadBranch?: boolean;
  mergeStatus?: number;
  ddevStatus?: number;
}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runCommand = (command: string, args: string[]) => {
    calls.push({ command, args });
    const normalizedArgs = command === "git" && args[0] === "-C" ? args.slice(2) : args;

    if (command === "git" && normalizedArgs[0] === "rev-parse" && normalizedArgs[1] === "--verify") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && normalizedArgs[0] === "checkout") {
      if (normalizedArgs[1] === "codex/sales-menu-images" && options.lockedHeadBranch) {
        return {
          status: 128,
          stdout: "",
          stderr:
            "fatal: 'codex/sales-menu-images' is already checked out at '/repo/.worktrees/sales-menu-images'\n",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && normalizedArgs[0] === "fetch" && normalizedArgs[1] === "origin") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && normalizedArgs[0] === "rev-parse" && normalizedArgs[1] === "origin/main") {
      return { status: 0, stdout: "base-tip\n", stderr: "" };
    }
    if (command === "git" && normalizedArgs[0] === "merge-base") {
      return { status: options.containsBase ? 0 : 1, stdout: "", stderr: "" };
    }
    if (command === "git" && normalizedArgs[0] === "merge") {
      return { status: options.mergeStatus ?? 0, stdout: "", stderr: "conflict\n" };
    }
    if (command === "ddev" && args[0] === "start") {
      return { status: options.ddevStatus ?? 0, stdout: "started\n", stderr: "" };
    }

    throw new Error(`Unexpected command: ${command} ${normalizedArgs.join(" ")}`);
  };

  return { calls, runCommand };
}

function gitCallArgs(call: { command: string; args: string[] }): string[] {
  return call.command === "git" && call.args[0] === "-C" ? call.args.slice(2) : call.args;
}

describe("PR ready tool", () => {
  it("reports a sync prompt when the branch is behind and --all is not set", async () => {
    const repoRoot = createRepo();
    const { calls, runCommand } = createCommandRecorder({ containsBase: false });

    const result = await readyPullRequestTool({
      all: false,
      forge: createForge(),
      prNumber: 115,
      repoRoot,
      runCommand,
      ensureCleanWorkingTree: vi.fn(),
      ensureVerificationCommandAvailable: vi.fn(),
      buildCommand: ["pnpm", "build"],
    });

    expect(result).toMatchObject({
      status: "needs-action",
      nextAction: "confirm-sync-base",
      baseSync: {
        status: "behind",
        remoteRef: "origin/main",
      },
      runtime: {
        kind: "unknown",
        status: "not-detected",
      },
    });
    expect(calls.some((call) => call.command === "git" && gitCallArgs(call)[0] === "merge")).toBe(false);
    expect(calls.some((call) => call.command === "ddev")).toBe(false);
  });

  it("syncs base and starts DDEV when --all is set", async () => {
    const repoRoot = createRepo();
    mkdirSync(resolve(repoRoot, ".ddev"), { recursive: true });
    writeFileSync(resolve(repoRoot, ".ddev", "config.yaml"), "name: bos\n", "utf8");
    const { calls, runCommand } = createCommandRecorder({ containsBase: false });

    const result = await readyPullRequestTool({
      all: true,
      forge: createForge(),
      prNumber: 115,
      repoRoot,
      runCommand,
      ensureCleanWorkingTree: vi.fn(),
      ensureVerificationCommandAvailable: vi.fn(),
      buildCommand: ["pnpm", "build"],
    });

    expect(result).toMatchObject({
      status: "ready",
      nextAction: "browse-local-app",
      baseSync: {
        status: "merged",
      },
      runtime: {
        kind: "ddev",
        status: "running",
        url: "https://bos.ddev.site",
        startCommand: ["ddev", "start"],
      },
    });
    expect(calls.some((call) => call.command === "git" && gitCallArgs(call)[0] === "merge")).toBe(true);
    expect(calls.some((call) => call.command === "ddev" && call.args[0] === "start")).toBe(true);
  });

  it("uses a current-checkout review branch when the PR head branch is locked in another worktree", async () => {
    const repoRoot = createRepo();
    mkdirSync(resolve(repoRoot, ".ddev"), { recursive: true });
    writeFileSync(resolve(repoRoot, ".ddev", "config.yaml"), "name: bos\n", "utf8");
    const { calls, runCommand } = createCommandRecorder({
      containsBase: true,
      lockedHeadBranch: true,
    });

    const result = await readyPullRequestTool({
      all: true,
      forge: createForge(),
      prNumber: 115,
      repoRoot,
      runCommand,
      ensureCleanWorkingTree: vi.fn(),
      ensureVerificationCommandAvailable: vi.fn(),
      buildCommand: ["pnpm", "build"],
    });

    expect(result).toMatchObject({
      status: "ready",
      branchName: "review/pr-115",
      nextAction: "browse-local-app",
      runtime: {
        kind: "ddev",
        status: "running",
        url: "https://bos.ddev.site",
      },
    });
    expect(calls.map(gitCallArgs)).toContainEqual([
      "fetch",
      "origin",
      "+refs/pull/115/head:refs/heads/review/pr-115",
    ]);
    expect(calls.map(gitCallArgs)).toContainEqual(["checkout", "review/pr-115"]);
  });

  it("blocks when --all base sync hits merge conflicts", async () => {
    const repoRoot = createRepo();
    mkdirSync(resolve(repoRoot, ".ddev"), { recursive: true });
    writeFileSync(resolve(repoRoot, ".ddev", "config.yaml"), "name: bos\n", "utf8");
    const { calls, runCommand } = createCommandRecorder({
      containsBase: false,
      mergeStatus: 1,
    });

    const result = await readyPullRequestTool({
      all: true,
      forge: createForge(),
      prNumber: 115,
      repoRoot,
      runCommand,
      ensureCleanWorkingTree: vi.fn(),
      ensureVerificationCommandAvailable: vi.fn(),
      buildCommand: ["pnpm", "build"],
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "merge-conflicts",
      nextAction: "resolve-conflicts",
      runtime: {
        kind: "ddev",
        status: "not-started",
      },
    });
    expect(calls.some((call) => call.command === "ddev")).toBe(false);
  });
});
