import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPullRequestResolveConflictsWorkspace,
  initializePullRequestResolveConflictsOutputLog,
  writePullRequestResolveConflictsConflictPrompt,
  writePullRequestResolveConflictsPrompt,
} from "./workspace";

const cleanupTargets = new Set<string>();

function createTempRepoRoot(): string {
  const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-pr-resolve-conflicts-"));
  cleanupTargets.add(repoRoot);
  return repoRoot;
}

afterEach(() => {
  for (const target of cleanupTargets) {
    rmSync(target, { recursive: true, force: true });
  }
  cleanupTargets.clear();
});

describe("pr-resolve-conflicts workspace", () => {
  it("creates the run directory and writes prompt and log artifacts", () => {
    const repoRoot = createTempRepoRoot();
    const workspace = createPullRequestResolveConflictsWorkspace(repoRoot, 123);

    writePullRequestResolveConflictsPrompt(workspace, ["pnpm", "build"]);
    initializePullRequestResolveConflictsOutputLog(repoRoot, workspace);

    expect(existsSync(workspace.runDir)).toBe(true);
    expect(workspace.runDir).toMatch(/\.prs\/runs\/.+-pr-123-resolve-conflicts$/);

    const prompt = readFileSync(workspace.promptFilePath, "utf8");
    const outputLog = readFileSync(workspace.outputLogPath, "utf8");

    expect(prompt).toContain("This run resolves pull request merge conflicts");
    expect(prompt).toContain("- run `pnpm build` before finishing if conflicts are resolved");
    expect(outputLog).toContain("# prs pr resolve-conflicts run log");
    expect(outputLog).toContain("Prompt file: .prs/runs/");
    expect(outputLog).toContain("Conflict prompt file: .prs/runs/");
  });

  it("writes a focused conflict prompt with the base ref and rerun command", () => {
    const repoRoot = createTempRepoRoot();
    const workspace = createPullRequestResolveConflictsWorkspace(repoRoot, 123);

    writePullRequestResolveConflictsConflictPrompt(workspace, {
      branchName: "feat/conflict-fix",
      pullRequestNumber: 123,
      baseSync: {
        baseRefName: "main",
        remoteRef: "origin/main",
        baseTip: "base-tip",
        status: "blocked",
        conflictResolution: "required",
        summary: "Merge conflicts require local resolution.",
        warnings: [],
      },
    });

    const prompt = readFileSync(workspace.conflictPromptFilePath, "utf8");

    expect(prompt).toContain(
      "Resolve the merge conflicts created while merging `origin/main`"
    );
    expect(prompt).toContain("prs pr resolve-conflicts 123");
  });
});
