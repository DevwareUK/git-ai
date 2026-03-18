import type { ResolvedRepositoryConfigType } from "@git-ai/contracts";
import { createGitHubRepositoryForge } from "./github";

export type IssueDetails = {
  title: string;
  body: string;
  url: string;
};

export type IssuePlanComment = {
  id: number;
  body: string;
  url: string;
  updatedAt: string;
};

export type CreatedIssueRecord = {
  number: number;
  title: string;
  url: string;
  status: "created" | "existing";
};

export interface CreatePullRequestInput {
  branchName: string;
  issueNumber: number;
  issueTitle: string;
  baseBranch: string;
  outputLogPath: string;
}

export interface RepositoryForge {
  readonly type: "github" | "none";
  isAuthenticated(): boolean;
  fetchIssueDetails(issueNumber: number): Promise<IssueDetails>;
  fetchIssuePlanComment(issueNumber: number): Promise<IssuePlanComment | undefined>;
  createIssuePlanComment(issueNumber: number, body: string): Promise<IssuePlanComment>;
  createDraftIssue(title: string, body: string): Promise<string>;
  createOrReuseIssue(
    title: string,
    body: string,
    labels: string[]
  ): Promise<CreatedIssueRecord>;
  createPullRequest(input: CreatePullRequestInput): void;
}

class NoopRepositoryForge implements RepositoryForge {
  readonly type = "none" as const;

  isAuthenticated(): boolean {
    return false;
  }

  async fetchIssueDetails(): Promise<IssueDetails> {
    throw new Error(
      "Repository forge support is disabled by .git-ai/config.json. Configure `forge.type` to enable issue workflows."
    );
  }

  async fetchIssuePlanComment(): Promise<IssuePlanComment | undefined> {
    throw new Error(
      "Repository forge support is disabled by .git-ai/config.json. Configure `forge.type` to enable issue workflows."
    );
  }

  async createIssuePlanComment(): Promise<IssuePlanComment> {
    throw new Error(
      "Repository forge support is disabled by .git-ai/config.json. Configure `forge.type` to enable issue workflows."
    );
  }

  async createDraftIssue(): Promise<string> {
    throw new Error(
      "Repository forge support is disabled by .git-ai/config.json. Configure `forge.type` to enable issue creation."
    );
  }

  async createOrReuseIssue(): Promise<CreatedIssueRecord> {
    throw new Error(
      "Repository forge support is disabled by .git-ai/config.json. Configure `forge.type` to enable issue creation."
    );
  }

  createPullRequest(): void {
    throw new Error(
      "Repository forge support is disabled by .git-ai/config.json. Configure `forge.type` to enable pull request creation."
    );
  }
}

export function createRepositoryForge(
  repoRoot: string,
  config: ResolvedRepositoryConfigType
): RepositoryForge {
  if (config.forge.type === "none") {
    return new NoopRepositoryForge();
  }

  return createGitHubRepositoryForge(repoRoot);
}
