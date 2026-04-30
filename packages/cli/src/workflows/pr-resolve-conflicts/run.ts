import { spawnSync } from "node:child_process";
import type { RepositoryForge } from "../../forge";
import { getInteractiveRuntimeByType } from "../../runtime";
import {
  ensureVerificationCommandAvailable,
  preflightRemoteBranch,
} from "../../workflow-preflights";
import {
  branchContainsCommit,
  buildIncompleteBaseSyncRecoveryMessage,
  getBaseSyncTip,
  isMergeInProgress,
  listUnmergedPaths,
  resolveBaseSyncRemoteRef,
  runBaseSyncTrackedCommand,
  runBaseSyncTrackedCommandAndCapture,
  type PullRequestBaseSyncState,
} from "../pr-base-sync";
import { pushReviewedPullRequestUpdates } from "../pull-request-reviewed-updates";
import type { PullRequestResolveConflictsCheckout } from "./types";
import {
  appendPullRequestResolveConflictsWarning,
  createPullRequestResolveConflictsWorkspace,
  initializePullRequestResolveConflictsOutputLog,
  writePullRequestResolveConflictsConflictPrompt,
  writePullRequestResolveConflictsMetadata,
  writePullRequestResolveConflictsPrompt,
} from "./workspace";

export type RunPrResolveConflictsCommandOptions = {
  prNumber: number;
  repoRoot: string;
  buildCommand: string[];
  ensureVerificationCommandAvailable?(
    repoRoot: string,
    buildCommand: string[],
    workflowLabel: string
  ): void;
  preflightBaseBranch?(
    repoRoot: string,
    remoteName: string,
    branchName: string,
    branchLabel: string,
    recoveryHint: string
  ): { remoteRef: string; remoteTip: string };
  forge: RepositoryForge;
  ensureCleanWorkingTree(repoRoot: string): void;
  verifyBuild(repoRoot: string, buildCommand: string[], outputLogPath: string): void;
};

class PullRequestResolveConflictsBaseSyncError extends Error {
  readonly baseSync: PullRequestBaseSyncState;

  constructor(message: string, baseSync: PullRequestBaseSyncState) {
    super(message);
    this.name = "PullRequestResolveConflictsBaseSyncError";
    this.baseSync = baseSync;
  }
}

function localBranchExists(repoRoot: string, branchName: string): boolean {
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "--verify", branchName], {
    stdio: "ignore",
  });

  return !result.error && result.status === 0;
}

function checkoutPullRequestHeadBranch(
  repoRoot: string,
  workspace: { outputLogPath: string },
  headRefName: string
): PullRequestResolveConflictsCheckout {
  const checkout: PullRequestResolveConflictsCheckout = localBranchExists(
    repoRoot,
    headRefName
  )
    ? {
        source: "local-head",
        branchName: headRefName,
      }
    : {
        source: "fetched-head",
        branchName: headRefName,
      };

  if (checkout.source === "fetched-head") {
    console.log(`Fetching PR head branch ${headRefName}...`);
    runBaseSyncTrackedCommand(
      repoRoot,
      workspace,
      "git",
      ["fetch", "origin", `${headRefName}:${headRefName}`],
      `Failed to fetch PR head branch "${headRefName}" from origin.`
    );
  }

  console.log(`Checking out ${checkout.branchName}...`);
  runBaseSyncTrackedCommand(
    repoRoot,
    workspace,
    "git",
    ["checkout", checkout.branchName],
    `Failed to check out branch "${checkout.branchName}".`
  );

  return checkout;
}

function ensureCodexAvailable(): void {
  const runtime = getInteractiveRuntimeByType("codex");
  const availability = runtime.checkAvailability();
  if (!availability.available) {
    throw new Error(
      `\`prs pr resolve-conflicts\` requires Codex for guided merge conflict resolution. Configured Codex is unavailable because ${availability.reason}.`
    );
  }
}

export async function runPrResolveConflictsCommand(
  options: RunPrResolveConflictsCommandOptions
): Promise<void> {
  if (options.forge.type === "none") {
    throw new Error(
      "Repository forge support is disabled by .prs/config.json. Configure `forge.type` to enable pull request workflows."
    );
  }

  ensureCodexAvailable();
  options.ensureCleanWorkingTree(options.repoRoot);
  (options.ensureVerificationCommandAvailable ?? ensureVerificationCommandAvailable)(
    options.repoRoot,
    options.buildCommand,
    "prs pr resolve-conflicts"
  );

  console.log(`Fetching pull request #${options.prNumber}...`);
  const pullRequest = await options.forge.fetchPullRequestDetails(options.prNumber);
  const workspace = createPullRequestResolveConflictsWorkspace(
    options.repoRoot,
    pullRequest.number
  );
  initializePullRequestResolveConflictsOutputLog(options.repoRoot, workspace);
  writePullRequestResolveConflictsPrompt(workspace, options.buildCommand);

  (options.preflightBaseBranch ?? preflightRemoteBranch)(
    options.repoRoot,
    "origin",
    pullRequest.baseRefName,
    `Pull request base branch "${pullRequest.baseRefName}"`,
    "confirm the pull request base branch"
  );

  const checkout = checkoutPullRequestHeadBranch(
    options.repoRoot,
    workspace,
    pullRequest.headRefName
  );

  console.log(`Fetching latest origin/${pullRequest.baseRefName}...`);
  runBaseSyncTrackedCommand(
    options.repoRoot,
    workspace,
    "git",
    ["fetch", "origin", pullRequest.baseRefName],
    `Failed to fetch the latest base branch "${pullRequest.baseRefName}" from origin.`
  );

  const remoteRef = resolveBaseSyncRemoteRef(pullRequest.baseRefName);
  const baseTip = getBaseSyncTip(options.repoRoot, workspace, remoteRef);

  if (branchContainsCommit(options.repoRoot, workspace, baseTip, "HEAD")) {
    const baseSync: PullRequestBaseSyncState = {
      baseRefName: pullRequest.baseRefName,
      remoteRef,
      baseTip,
      status: "up-to-date",
      conflictResolution: "not-needed",
      summary: `Checked-out branch "${checkout.branchName}" already contained ${remoteRef} tip ${baseTip}.`,
      warnings: [],
    };
    writePullRequestResolveConflictsMetadata(options.repoRoot, workspace, {
      pullRequest,
      checkout,
      baseSync,
      runtime: { type: "codex", conflictSessionLaunched: false },
    });
    console.log(baseSync.summary);
    return;
  }

  console.log(`Merging latest ${remoteRef} into ${checkout.branchName}...`);
  const mergeResult = runBaseSyncTrackedCommandAndCapture(
    options.repoRoot,
    workspace,
    "git",
    ["merge", "--no-edit", "--no-ff", remoteRef]
  );

  if (mergeResult.error) {
    throw new Error(
      `Failed to merge latest base branch "${remoteRef}" into "${checkout.branchName}". ${mergeResult.error.message}`
    );
  }

  if (mergeResult.status === 0) {
    const baseSync: PullRequestBaseSyncState = {
      baseRefName: pullRequest.baseRefName,
      remoteRef,
      baseTip,
      status: "merged",
      conflictResolution: "not-needed",
      summary: `Merged ${remoteRef} tip ${baseTip} into "${checkout.branchName}".`,
      warnings: [],
    };
    writePullRequestResolveConflictsMetadata(options.repoRoot, workspace, {
      pullRequest,
      checkout,
      baseSync,
      runtime: { type: "codex", conflictSessionLaunched: false },
    });
    options.verifyBuild(options.repoRoot, options.buildCommand, workspace.outputLogPath);
    pushReviewedPullRequestUpdates(
      options.repoRoot,
      workspace.outputLogPath,
      pullRequest.headRefName
    );
    return;
  }

  const mergeInProgress = isMergeInProgress(options.repoRoot, workspace);
  const unmergedPaths = listUnmergedPaths(options.repoRoot, workspace);
  if (!mergeInProgress && unmergedPaths.length === 0) {
    throw new Error(
      `Failed to merge latest base branch "${remoteRef}" into "${checkout.branchName}".`
    );
  }

  const conflictWarning =
    `Merging ${remoteRef} into "${checkout.branchName}" produced conflicts. Opening Codex to resolve them.`;
  console.log(conflictWarning);
  appendPullRequestResolveConflictsWarning(workspace, conflictWarning);

  const blockedBaseSync: PullRequestBaseSyncState = {
    baseRefName: pullRequest.baseRefName,
    remoteRef,
    baseTip,
    status: "blocked",
    conflictResolution: "required",
    summary: `Syncing "${checkout.branchName}" with ${remoteRef} tip ${baseTip} requires merge conflict resolution.`,
    warnings: [conflictWarning],
  };
  writePullRequestResolveConflictsConflictPrompt(workspace, {
    branchName: checkout.branchName,
    pullRequestNumber: pullRequest.number,
    baseSync: blockedBaseSync,
  });
  writePullRequestResolveConflictsMetadata(options.repoRoot, workspace, {
    pullRequest,
    checkout,
    baseSync: blockedBaseSync,
    runtime: { type: "codex", conflictSessionLaunched: true },
  });

  getInteractiveRuntimeByType("codex").launch(options.repoRoot, {
    promptFilePath: workspace.conflictPromptFilePath,
    outputLogPath: workspace.outputLogPath,
  });

  const mergeStillInProgress = isMergeInProgress(options.repoRoot, workspace);
  const remainingUnmergedPaths = listUnmergedPaths(options.repoRoot, workspace);
  const nowContainsBaseTip = branchContainsCommit(
    options.repoRoot,
    workspace,
    baseTip,
    "HEAD"
  );
  if (mergeStillInProgress || remainingUnmergedPaths.length > 0 || !nowContainsBaseTip) {
    const recoveryMessage = buildIncompleteBaseSyncRecoveryMessage({
      branchName: checkout.branchName,
      pullRequest,
      remoteRef,
      baseTip,
      mergeStillInProgress,
      remainingUnmergedPaths,
      nowContainsBaseTip,
      rerunCommand: `prs pr resolve-conflicts ${pullRequest.number}`,
    });
    appendPullRequestResolveConflictsWarning(workspace, recoveryMessage);

    const unresolvedBaseSync: PullRequestBaseSyncState = {
      baseRefName: pullRequest.baseRefName,
      remoteRef,
      baseTip,
      status: "blocked",
      conflictResolution: "unresolved",
      summary: `Base-branch sync with ${remoteRef} tip ${baseTip} is still incomplete on "${checkout.branchName}".`,
      warnings: [conflictWarning],
      recoveryMessage,
    };
    writePullRequestResolveConflictsMetadata(options.repoRoot, workspace, {
      pullRequest,
      checkout,
      baseSync: unresolvedBaseSync,
      runtime: { type: "codex", conflictSessionLaunched: true },
    });
    throw new PullRequestResolveConflictsBaseSyncError(
      recoveryMessage,
      unresolvedBaseSync
    );
  }

  const resolvedWarning =
    `Codex resolved the merge conflicts while merging ${remoteRef} into "${checkout.branchName}".`;
  console.log(resolvedWarning);
  appendPullRequestResolveConflictsWarning(workspace, resolvedWarning);

  const resolvedBaseSync: PullRequestBaseSyncState = {
    baseRefName: pullRequest.baseRefName,
    remoteRef,
    baseTip,
    status: "merged",
    conflictResolution: "required",
    summary: `Merged ${remoteRef} tip ${baseTip} into "${checkout.branchName}" after Codex resolved the sync conflicts.`,
    warnings: [conflictWarning, resolvedWarning],
  };
  writePullRequestResolveConflictsMetadata(options.repoRoot, workspace, {
    pullRequest,
    checkout,
    baseSync: resolvedBaseSync,
    runtime: { type: "codex", conflictSessionLaunched: true },
  });
  options.verifyBuild(options.repoRoot, options.buildCommand, workspace.outputLogPath);
  pushReviewedPullRequestUpdates(
    options.repoRoot,
    workspace.outputLogPath,
    pullRequest.headRefName
  );
}
