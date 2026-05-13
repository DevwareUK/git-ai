import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestDetails, RepositoryForge } from "../../forge";
import { getInteractiveRuntimeByType } from "../../runtime";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("../../runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../runtime")>();
  return {
    ...actual,
    getInteractiveRuntimeByType: vi.fn(),
  };
});

import { runPrResolveConflictsCommand } from "./run";

function createPullRequest(): PullRequestDetails {
  return {
    number: 76,
    title: "Resolve conflicts for guided PR workflow",
    body: "Sync with the base branch.",
    url: "https://github.com/DevwareUK/prs/pull/76",
    baseRefName: "main",
    headRefName: "feat/conflict-fix",
  };
}

function createForge(
  pullRequest: PullRequestDetails = createPullRequest()
): {
  forge: RepositoryForge;
  fetchPullRequestDetails: ReturnType<typeof vi.fn>;
} {
  const fetchPullRequestDetails = vi.fn().mockResolvedValue(pullRequest);

  return {
    forge: {
      type: "github",
      isAuthenticated: () => true,
      fetchIssueDetails: vi.fn(),
      fetchIssueComments: vi.fn(),
      fetchIssuePlanComment: vi.fn(),
      fetchAuditComment: vi.fn(),
      fetchPullRequestDetails,
      fetchPullRequestChecks: vi.fn(),
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
    },
    fetchPullRequestDetails,
  };
}

function mockSuccessfulCodex(launch = vi.fn()): ReturnType<typeof vi.fn> {
  vi.mocked(getInteractiveRuntimeByType).mockReturnValue({
    type: "codex",
    displayName: "Codex",
    metadata: {
      executable: "codex",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      supportsSessionTracking: true,
    },
    checkAvailability: () => ({ available: true }),
    launch,
  });
  return launch;
}

function mockSpawn(
  handler: (command: string, args: string[]) => { status: number; stdout?: string; stderr?: string }
): void {
  vi.mocked(spawnSync).mockImplementation((command, args) => {
    const normalizedArgs = Array.isArray(args) ? args.map(String) : [];
    const result = handler(String(command), normalizedArgs);
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    } as never;
  });
}

function readLatestMetadata(repoRoot: string): Record<string, unknown> {
  const calls = vi.mocked(spawnSync).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const runDir = resolve(repoRoot, ".prs", "runs");
  const candidates = readdirSync(runDir)
    .filter((entry) => entry.endsWith("-pr-76-resolve-conflicts"))
    .sort();
  expect(candidates.length).toBeGreaterThan(0);
  return JSON.parse(
    readFileSync(resolve(runDir, candidates[candidates.length - 1], "metadata.json"), "utf8")
  ) as Record<string, unknown>;
}

function createOptions(repoRoot: string, overrides: Partial<Parameters<typeof runPrResolveConflictsCommand>[0]> = {}) {
  const { forge } = createForge();
  return {
    prNumber: 76,
    repoRoot,
    buildCommand: ["pnpm", "build"],
    ensureVerificationCommandAvailable: vi.fn(),
    preflightBaseBranch: vi.fn().mockReturnValue({
      remoteRef: "origin/main",
      remoteTip: "base-tip",
    }),
    forge,
    ensureCleanWorkingTree: vi.fn(),
    verifyBuild: vi.fn(),
    ...overrides,
  };
}

describe("runPrResolveConflictsCommand", () => {
  const cleanupTargets = new Set<string>();

  function createTempRepoRoot(): string {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-pr-resolve-conflicts-"));
    cleanupTargets.add(repoRoot);
    return repoRoot;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockSuccessfulCodex();
    mockSpawn((command, args) => {
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (
        command === "git" &&
        args[0] === "merge-base" &&
        args[1] === "--is-ancestor"
      ) {
        return { status: 0 };
      }
      if (
        command === "git" &&
        args[0] === "rev-parse" &&
        args[1] === "origin/feat/conflict-fix"
      ) {
        return { status: 0, stdout: "head-tip\n" };
      }
      if (command === "git" && args[0] === "rev-list") {
        return { status: 0, stdout: "0 1\n" };
      }
      return { status: 0 };
    });
  });

  afterEach(() => {
    for (const target of cleanupTargets) {
      rmSync(target, { recursive: true, force: true });
    }
    cleanupTargets.clear();
  });

  it("fails clearly when repository forge support is disabled", async () => {
    const repoRoot = createTempRepoRoot();

    await expect(
      runPrResolveConflictsCommand(
        createOptions(repoRoot, {
          forge: {
            ...createForge().forge,
            type: "none",
          },
        })
      )
    ).rejects.toThrow(
      "Repository forge support is disabled by .prs/config.json. Configure `forge.type` to enable pull request workflows."
    );
  });

  it("fails clearly when the working tree is dirty", async () => {
    const repoRoot = createTempRepoRoot();
    const ensureCleanWorkingTree = vi.fn(() => {
      throw new Error("Working tree must be clean before resolving PR conflicts.");
    });

    await expect(
      runPrResolveConflictsCommand(createOptions(repoRoot, { ensureCleanWorkingTree }))
    ).rejects.toThrow("Working tree must be clean before resolving PR conflicts.");
  });

  it("fails clearly when Codex is unavailable", async () => {
    const repoRoot = createTempRepoRoot();
    vi.mocked(getInteractiveRuntimeByType).mockReturnValue({
      type: "codex",
      displayName: "Codex",
      metadata: {
        executable: "codex",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        supportsSessionTracking: true,
      },
      checkAvailability: () => ({ available: false, reason: "codex is not on PATH" }),
      launch: vi.fn(),
    });

    await expect(
      runPrResolveConflictsCommand(createOptions(repoRoot))
    ).rejects.toThrow(
      "`prs pr resolve-conflicts` requires Codex for guided merge conflict resolution. Configured Codex is unavailable because codex is not on PATH."
    );
  });

  it("fails clearly when the verification command cannot be preflighted", async () => {
    const repoRoot = createTempRepoRoot();
    const { forge, fetchPullRequestDetails } = createForge();
    const ensureVerificationCommandAvailable = vi.fn(() => {
      throw new Error("Configured verification command is unavailable.");
    });

    await expect(
      runPrResolveConflictsCommand(
        createOptions(repoRoot, { ensureVerificationCommandAvailable, forge })
      )
    ).rejects.toThrow("Configured verification command is unavailable.");

    expect(ensureVerificationCommandAvailable).toHaveBeenCalledWith(
      repoRoot,
      ["pnpm", "build"],
      "prs pr resolve-conflicts"
    );
    expect(fetchPullRequestDetails).not.toHaveBeenCalled();
  });

  it("exits without build or push when the checked-out branch already contains the base tip", async () => {
    const repoRoot = createTempRepoRoot();
    const verifyBuild = vi.fn();

    await runPrResolveConflictsCommand(createOptions(repoRoot, { verifyBuild }));

    expect(verifyBuild).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/conflict-fix"],
      expect.anything()
    );

    const metadata = readLatestMetadata(repoRoot);
    expect(metadata).toMatchObject({
      baseSync: {
        status: "up-to-date",
        conflictResolution: "not-needed",
      },
      runtime: {
        type: "codex",
        conflictSessionLaunched: false,
      },
    });
  });

  it("fetches the PR head branch when no local checkout exists and records that checkout source", async () => {
    const repoRoot = createTempRepoRoot();
    const verifyBuild = vi.fn();
    const commands: string[][] = [];
    mockSpawn((command, args) => {
      if (command === "git") {
        commands.push(args);
      }
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 1 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (command === "git" && args[0] === "merge-base") {
        return { status: 0 };
      }
      return { status: 0 };
    });

    await runPrResolveConflictsCommand(createOptions(repoRoot, { verifyBuild }));

    expect(commands).toContainEqual([
      "fetch",
      "origin",
      "feat/conflict-fix:feat/conflict-fix",
    ]);
    expect(commands).toContainEqual(["checkout", "feat/conflict-fix"]);
    expect(verifyBuild).not.toHaveBeenCalled();

    const metadata = readLatestMetadata(repoRoot);
    expect(metadata).toMatchObject({
      checkout: {
        source: "fetched-head",
        branchName: "feat/conflict-fix",
      },
      baseSync: {
        status: "up-to-date",
        conflictResolution: "not-needed",
      },
    });
  });

  it("runs build verification and guarded push after a clean base merge", async () => {
    const repoRoot = createTempRepoRoot();
    const verifyBuild = vi.fn();
    let ancestorChecks = 0;
    mockSpawn((command, args) => {
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (command === "git" && args[0] === "merge-base") {
        ancestorChecks += 1;
        return { status: ancestorChecks === 1 ? 1 : 0 };
      }
      if (command === "git" && args[0] === "merge") {
        return { status: 0 };
      }
      if (
        command === "git" &&
        args[0] === "rev-parse" &&
        args[1] === "origin/feat/conflict-fix"
      ) {
        return { status: 0, stdout: "head-tip\n" };
      }
      if (command === "git" && args[0] === "rev-list") {
        return { status: 0, stdout: "0 1\n" };
      }
      return { status: 0 };
    });

    await runPrResolveConflictsCommand(createOptions(repoRoot, { verifyBuild }));

    const metadata = readLatestMetadata(repoRoot);
    expect(verifyBuild).toHaveBeenCalledWith(
      repoRoot,
      ["pnpm", "build"],
      expect.stringMatching(/output\.log$/)
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/conflict-fix"],
      expect.objectContaining({ cwd: repoRoot })
    );
    expect(metadata).toMatchObject({
      baseSync: {
        status: "merged",
        conflictResolution: "not-needed",
      },
    });
  });

  it("launches Codex, verifies the resolved merge state, runs the build, and pushes", async () => {
    const repoRoot = createTempRepoRoot();
    const launch = mockSuccessfulCodex();
    const verifyBuild = vi.fn();
    let ancestorChecks = 0;
    let mergeHeadChecks = 0;
    let unmergedPathChecks = 0;
    mockSpawn((command, args) => {
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (command === "git" && args[0] === "merge-base") {
        ancestorChecks += 1;
        return { status: ancestorChecks === 1 ? 1 : 0 };
      }
      if (command === "git" && args[0] === "merge") {
        return { status: 1, stderr: "conflict\n" };
      }
      if (command === "git" && args[0] === "rev-parse" && args.includes("MERGE_HEAD")) {
        mergeHeadChecks += 1;
        return { status: mergeHeadChecks === 1 ? 0 : 1 };
      }
      if (command === "git" && args[0] === "diff") {
        unmergedPathChecks += 1;
        return {
          status: 0,
          stdout: unmergedPathChecks === 1 ? "packages/cli/src/index.ts\n" : "",
        };
      }
      if (
        command === "git" &&
        args[0] === "rev-parse" &&
        args[1] === "origin/feat/conflict-fix"
      ) {
        return { status: 0, stdout: "head-tip\n" };
      }
      if (command === "git" && args[0] === "rev-list") {
        return { status: 0, stdout: "0 1\n" };
      }
      return { status: 0 };
    });

    await runPrResolveConflictsCommand(createOptions(repoRoot, { verifyBuild }));

    expect(launch).toHaveBeenCalledWith(
      repoRoot,
      expect.objectContaining({
        promptFilePath: expect.stringMatching(/conflict-resolution-prompt\.md$/),
      })
    );
    expect(verifyBuild).toHaveBeenCalledWith(
      repoRoot,
      ["pnpm", "build"],
      expect.stringMatching(/output\.log$/)
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/conflict-fix"],
      expect.any(Object)
    );

    const metadata = readLatestMetadata(repoRoot);
    expect(metadata).toMatchObject({
      baseSync: {
        status: "merged",
        conflictResolution: "required",
      },
      runtime: {
        type: "codex",
        conflictSessionLaunched: true,
      },
    });
  });

  it("fails with recovery guidance when conflicts remain after Codex exits", async () => {
    const repoRoot = createTempRepoRoot();
    let ancestorChecks = 0;
    mockSpawn((command, args) => {
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (command === "git" && args[0] === "merge-base") {
        ancestorChecks += 1;
        return { status: ancestorChecks === 1 ? 1 : 0 };
      }
      if (command === "git" && args[0] === "merge") {
        return { status: 1, stderr: "conflict\n" };
      }
      if (command === "git" && args[0] === "rev-parse" && args.includes("MERGE_HEAD")) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "diff") {
        return { status: 0, stdout: "packages/cli/src/index.ts\n" };
      }
      return { status: 0 };
    });

    await expect(
      runPrResolveConflictsCommand(createOptions(repoRoot))
    ).rejects.toThrow('Base-branch sync is still incomplete for "feat/conflict-fix".');

    const metadata = readLatestMetadata(repoRoot);
    expect(metadata).toMatchObject({
      baseSync: {
        status: "blocked",
        conflictResolution: "unresolved",
        recoveryMessage: expect.stringContaining("Remaining conflicted files"),
      },
    });
  });

  it("does not push when build verification fails after a clean merge", async () => {
    const repoRoot = createTempRepoRoot();
    const verifyBuild = vi.fn(() => {
      throw new Error("build failed");
    });
    mockSpawn((command, args) => {
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (command === "git" && args[0] === "merge-base") {
        return { status: 1 };
      }
      if (command === "git" && args[0] === "merge") {
        return { status: 0 };
      }
      return { status: 0 };
    });

    await expect(
      runPrResolveConflictsCommand(createOptions(repoRoot, { verifyBuild }))
    ).rejects.toThrow("build failed");

    expect(spawnSync).not.toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/conflict-fix"],
      expect.any(Object)
    );
  });

  it("fails before push when the remote PR head has diverged", async () => {
    const repoRoot = createTempRepoRoot();
    mockSpawn((command, args) => {
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[2] === "rev-parse" &&
        args[4] === "feat/conflict-fix"
      ) {
        return { status: 0 };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
        return { status: 0, stdout: "base-tip\n" };
      }
      if (command === "git" && args[0] === "merge-base") {
        return { status: 1 };
      }
      if (command === "git" && args[0] === "merge") {
        return { status: 0 };
      }
      if (
        command === "git" &&
        args[0] === "rev-parse" &&
        args[1] === "origin/feat/conflict-fix"
      ) {
        return { status: 0, stdout: "head-tip\n" };
      }
      if (command === "git" && args[0] === "rev-list") {
        return { status: 0, stdout: "1 1\n" };
      }
      return { status: 0 };
    });

    await expect(
      runPrResolveConflictsCommand(createOptions(repoRoot))
    ).rejects.toThrow(
      'Cannot push reviewed updates to "feat/conflict-fix" because HEAD diverged from origin/feat/conflict-fix (1 ahead, 1 behind). Local commits were kept.'
    );

    expect(spawnSync).not.toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/conflict-fix"],
      expect.any(Object)
    );
  });
});
