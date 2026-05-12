import { parseIssueNumber } from "./issue";

export type ReviewOutputFormat = "json" | "markdown";

export type ReviewCommandOptions = {
  base?: string;
  head?: string;
  format: ReviewOutputFormat;
  issueNumber?: number;
};

export const REVIEW_USAGE = [
  "Usage:",
  "  prs review [--base <git-ref>] [--head <git-ref>] [--format <markdown|json>]",
  "                [--issue-number <number>]",
  "  prs review diff [--base <git-ref>] [--head <git-ref>] [--format <markdown|json>]",
  "                  [--issue-number <number>]",
  "  prs review tests [test-backlog options]",
  "  prs review features [feature-backlog options]",
].join("\n");

export function parseReviewCommandArgs(args: string[]): ReviewCommandOptions {
  const normalizedArgs =
    args[0] === "review" && args[1] === "diff" ? ["review", ...args.slice(2)] : args;
  const optionArgs = normalizedArgs.slice(1);
  let base: string | undefined;
  let head: string | undefined;
  let format: ReviewOutputFormat = "markdown";
  let issueNumber: number | undefined;

  for (let index = 0; index < optionArgs.length; index += 1) {
    const rawArg = optionArgs[index];

    if (rawArg === "--base") {
      base = optionArgs[index + 1]?.trim();
      if (!base) {
        throw new Error(`Missing value for --base. ${REVIEW_USAGE}`);
      }
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--base=")) {
      base = rawArg.slice("--base=".length).trim();
      if (!base) {
        throw new Error(`Missing value for --base. ${REVIEW_USAGE}`);
      }
      continue;
    }

    if (rawArg === "--head") {
      head = optionArgs[index + 1]?.trim();
      if (!head) {
        throw new Error(`Missing value for --head. ${REVIEW_USAGE}`);
      }
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--head=")) {
      head = rawArg.slice("--head=".length).trim();
      if (!head) {
        throw new Error(`Missing value for --head. ${REVIEW_USAGE}`);
      }
      continue;
    }

    if (rawArg === "--format") {
      const rawFormat = optionArgs[index + 1];
      if (rawFormat !== "json" && rawFormat !== "markdown") {
        throw new Error(`Invalid format "${rawFormat ?? ""}". ${REVIEW_USAGE}`);
      }
      format = rawFormat;
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--format=")) {
      const rawFormat = rawArg.slice("--format=".length);
      if (rawFormat !== "json" && rawFormat !== "markdown") {
        throw new Error(`Invalid format "${rawFormat}". ${REVIEW_USAGE}`);
      }
      format = rawFormat;
      continue;
    }

    if (rawArg === "--issue-number") {
      issueNumber = parseIssueNumber(optionArgs[index + 1]);
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--issue-number=")) {
      issueNumber = parseIssueNumber(rawArg.slice("--issue-number=".length));
      continue;
    }

    throw new Error(`Unknown review option "${rawArg}". ${REVIEW_USAGE}`);
  }

  if (head && !base) {
    throw new Error(`--head requires --base. ${REVIEW_USAGE}`);
  }

  return {
    base,
    head,
    format,
    issueNumber,
  };
}
