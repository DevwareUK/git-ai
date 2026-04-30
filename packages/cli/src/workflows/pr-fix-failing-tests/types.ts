import type { IssueDetails } from "../../forge";

export type PullRequestFixFailingTestsWorkspace = {
  runDir: string;
  snapshotFilePath: string;
  promptFilePath: string;
  metadataFilePath: string;
  outputLogPath: string;
};

export type PullRequestLinkedIssueContext = IssueDetails & {
  number: number;
};

export type VerificationFailure = {
  command: string[];
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};
