import { formatCommandForDisplay } from "../../config";
import type { PullRequestDetails } from "../../forge";
import { fetchLinkedIssuesForPullRequest } from "../pr-fix-comments/snapshot";
import type {
  PullRequestLinkedIssueContext,
  VerificationFailure,
} from "./types";

export { fetchLinkedIssuesForPullRequest };

function formatOptionalText(value: string): string {
  return value.length > 0 ? value : "(No output captured.)";
}

export function formatPullRequestFailingTestsSnapshot(
  pullRequest: PullRequestDetails,
  initialFailure: VerificationFailure,
  buildCommand: string[],
  linkedIssues: PullRequestLinkedIssueContext[]
): string {
  const pullRequestBody = pullRequest.body.trim() || "(No pull request body provided.)";
  const status =
    initialFailure.status === null ? "No exit status" : String(initialFailure.status);
  const lines = [
    "# Pull Request Failing Tests Snapshot",
    "",
    "## Pull Request",
    "",
    `- PR number: ${pullRequest.number}`,
    `- Title: ${pullRequest.title}`,
    `- URL: ${pullRequest.url}`,
    `- Base branch: ${pullRequest.baseRefName}`,
    `- Head branch: ${pullRequest.headRefName}`,
    "",
    "## Body",
    "",
    pullRequestBody,
  ];

  if (linkedIssues.length > 0) {
    lines.push("", "## Linked issues");

    for (const issue of linkedIssues) {
      lines.push(
        "",
        `### Issue #${issue.number}: ${issue.title}`,
        "",
        `- URL: ${issue.url}`,
        "",
        issue.body.trim() || "(No issue body provided.)"
      );
    }
  }

  lines.push(
    "",
    "## Configured verification command",
    "",
    `\`${formatCommandForDisplay(buildCommand)}\``,
    "",
    "## Initial failure",
    "",
    `- Command: \`${formatCommandForDisplay(initialFailure.command)}\``,
    `- Exit status: ${status}`
  );

  if (initialFailure.error) {
    lines.push(`- Process error: ${initialFailure.error}`);
  }

  lines.push(
    "",
    "### stdout",
    "",
    "```text",
    formatOptionalText(initialFailure.stdout),
    "```",
    "",
    "### stderr",
    "",
    "```text",
    formatOptionalText(initialFailure.stderr),
    "```",
    "",
    "## Success criteria",
    "",
    "- Fix the captured failing verification output on the checked-out PR branch.",
    "- Keep changes focused on the failure shown above and the pull request context.",
    "- Preserve the repository's existing architecture and test patterns.",
    "- Leave the configured verification command passing before completion.",
    ""
  );

  return lines.join("\n");
}
