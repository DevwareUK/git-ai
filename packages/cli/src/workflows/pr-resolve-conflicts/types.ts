import type { PullRequestDetails } from "../../forge";
import type { PullRequestBaseSyncState } from "../pr-base-sync";

export type PullRequestResolveConflictsWorkspace = {
  runDir: string;
  promptFilePath: string;
  conflictPromptFilePath: string;
  metadataFilePath: string;
  outputLogPath: string;
};

export type PullRequestResolveConflictsCheckout = {
  branchName: string;
  source: "local-head" | "fetched-head";
};

export type PullRequestResolveConflictsMetadataInput = {
  pullRequest: PullRequestDetails;
  checkout: PullRequestResolveConflictsCheckout;
  baseSync: PullRequestBaseSyncState;
  runtime: {
    type: "codex";
    conflictSessionLaunched: boolean;
  };
};
