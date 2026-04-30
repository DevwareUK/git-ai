import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCommandForDisplay } from "../../config";
import { formatRunTimestamp, toRepoRelativePath } from "../../run-artifacts";
import type { PullRequestBaseSyncState } from "../pr-base-sync";
import type {
  PullRequestResolveConflictsMetadataInput,
  PullRequestResolveConflictsWorkspace,
} from "./types";

export function createPullRequestResolveConflictsWorkspace(
  repoRoot: string,
  prNumber: number
): PullRequestResolveConflictsWorkspace {
  const runDir = resolve(
    repoRoot,
    ".prs",
    "runs",
    `${formatRunTimestamp()}-pr-${prNumber}-resolve-conflicts`
  );

  mkdirSync(runDir, { recursive: true });

  return {
    runDir,
    promptFilePath: resolve(runDir, "prompt.md"),
    conflictPromptFilePath: resolve(runDir, "conflict-resolution-prompt.md"),
    metadataFilePath: resolve(runDir, "metadata.json"),
    outputLogPath: resolve(runDir, "output.log"),
  };
}

function buildPrompt(buildCommand: string[]): string {
  return [
    "You are working in the current repository.",
    "This run resolves pull request merge conflicts by syncing the PR branch with its latest base branch.",
    "",
    "Instructions to the coding agent:",
    "- keep changes focused on completing the current base-branch merge",
    `- run \`${formatCommandForDisplay(buildCommand)}\` before finishing if conflicts are resolved`,
    "- do not generate a review brief or address unrelated PR feedback",
  ].join("\n");
}

function buildConflictPrompt(input: {
  branchName: string;
  pullRequestNumber: number;
  baseSync: PullRequestBaseSyncState;
}): string {
  return [
    "You are working in the current repository.",
    "A merge conflict happened while resolving pull request conflicts.",
    "",
    `Resolve the merge conflicts created while merging \`${input.baseSync.remoteRef}\` into the checked-out branch \`${input.branchName}\`.`,
    "",
    "Instructions to the coding agent:",
    "- inspect the conflicted files and merge context before editing",
    "- complete the merge so the repository no longer has unresolved conflicts or an in-progress conflicted merge",
    `- make sure the resulting branch includes the fetched base branch tip ${input.baseSync.baseTip}`,
    "- do not address unrelated review comments, tests, or cleanup",
    "- if you cannot resolve the conflicts cleanly, stop without pretending the PR branch is ready",
    "",
    `When the merge conflict resolution work is complete, stop. If more work is needed later, rerun \`prs pr resolve-conflicts ${input.pullRequestNumber}\`.`,
  ].join("\n");
}

export function initializePullRequestResolveConflictsOutputLog(
  repoRoot: string,
  workspace: PullRequestResolveConflictsWorkspace
): void {
  writeFileSync(
    workspace.outputLogPath,
    [
      "# prs pr resolve-conflicts run log",
      "",
      `Created: ${new Date().toISOString()}`,
      `Prompt file: ${toRepoRelativePath(repoRoot, workspace.promptFilePath)}`,
      `Conflict prompt file: ${toRepoRelativePath(repoRoot, workspace.conflictPromptFilePath)}`,
      "",
    ].join("\n"),
    "utf8"
  );
}

export function appendPullRequestResolveConflictsWarning(
  workspace: PullRequestResolveConflictsWorkspace,
  warning: string
): void {
  appendFileSync(workspace.outputLogPath, `Warning: ${warning}\n`, "utf8");
}

export function writePullRequestResolveConflictsPrompt(
  workspace: PullRequestResolveConflictsWorkspace,
  buildCommand: string[]
): void {
  writeFileSync(workspace.promptFilePath, `${buildPrompt(buildCommand)}\n`, "utf8");
}

export function writePullRequestResolveConflictsConflictPrompt(
  workspace: PullRequestResolveConflictsWorkspace,
  input: {
    branchName: string;
    pullRequestNumber: number;
    baseSync: PullRequestBaseSyncState;
  }
): void {
  writeFileSync(
    workspace.conflictPromptFilePath,
    `${buildConflictPrompt(input)}\n`,
    "utf8"
  );
}

export function writePullRequestResolveConflictsMetadata(
  repoRoot: string,
  workspace: PullRequestResolveConflictsWorkspace,
  input: PullRequestResolveConflictsMetadataInput
): void {
  writeFileSync(
    workspace.metadataFilePath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        flow: "pr-resolve-conflicts",
        prNumber: input.pullRequest.number,
        prTitle: input.pullRequest.title,
        prUrl: input.pullRequest.url,
        baseRefName: input.pullRequest.baseRefName,
        headRefName: input.pullRequest.headRefName,
        promptFile: toRepoRelativePath(repoRoot, workspace.promptFilePath),
        conflictPromptFile: toRepoRelativePath(
          repoRoot,
          workspace.conflictPromptFilePath
        ),
        outputLog: toRepoRelativePath(repoRoot, workspace.outputLogPath),
        runDir: toRepoRelativePath(repoRoot, workspace.runDir),
        checkout: input.checkout,
        baseSync: input.baseSync,
        runtime: input.runtime,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
