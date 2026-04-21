import type { IssueDetails, RepositoryComment } from "../../forge";

export type PullRequestFixTestsWorkspace = {
  runDir: string;
  snapshotFilePath: string;
  promptFilePath: string;
  metadataFilePath: string;
  outputLogPath: string;
};

export type PullRequestLinkedIssueContext = IssueDetails & {
  number: number;
};

export type PullRequestTestSuggestionPriority = "high" | "medium" | "low";

export type PullRequestTestSuggestion = {
  suggestionId: string;
  area: string;
  priority: PullRequestTestSuggestionPriority;
  testType: string;
  behavior: string;
  regressionRisk: string;
  value: string;
  protectedPaths: string[];
  likelyLocations: string[];
  edgeCases: string[];
  implementationNote: string;
};

export type PullRequestTestSuggestionsComment = {
  sourceComment: RepositoryComment;
  overview: string;
  suggestions: PullRequestTestSuggestion[];
  edgeCases: string[];
  likelyLocations: string[];
};
