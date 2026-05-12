export type PrCommandOptions = {
  action:
    | "fix-comments"
    | "fix-failing-tests"
    | "fix-tests"
    | "resolve-conflicts";
  prNumber: number;
};

export const PR_USAGE = [
  "Usage:",
  "  prs pr resolve-conflicts <pr-number>",
  "  prs pr fix-comments <pr-number>",
  "  prs pr fix-failing-tests <pr-number>",
  "  prs pr fix-tests <pr-number>",
].join("\n");

export const PR_PREPARE_REVIEW_RETIRED_MESSAGE = [
  "`prs pr prepare-review <pr-number>` has been retired because it launched Codex from inside a PR workflow.",
  "Use `prs tool pr prepare-review <pr-number> --json` for deterministic Codex-safe review preparation.",
  "Use `prs codex pr prepare-review <pr-number>` only when you explicitly want the legacy Codex launcher.",
].join(" ");

export function parsePrCommandArgs(
  args: string[],
  parseIssueNumber: (rawValue: string | undefined) => number
): PrCommandOptions {
  const prArgs = args.slice(1);
  const subcommand = prArgs[0];

  if (subcommand === "prepare-review") {
    throw new Error(PR_PREPARE_REVIEW_RETIRED_MESSAGE);
  }

  if (
    subcommand !== "fix-comments" &&
    subcommand !== "fix-failing-tests" &&
    subcommand !== "fix-tests" &&
    subcommand !== "resolve-conflicts"
  ) {
    throw new Error(`Unknown pr subcommand "${subcommand ?? ""}". ${PR_USAGE}`);
  }

  const optionArgs = prArgs.slice(2);
  if (optionArgs.length > 0) {
    throw new Error(`Unknown pr option "${optionArgs[0]}". ${PR_USAGE}`);
  }

  return {
    action: subcommand,
    prNumber: parseIssueNumber(prArgs[1]),
  };
}
