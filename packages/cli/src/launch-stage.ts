export type LaunchStageNoticeId =
  | "feature-backlog"
  | "issue-batch"
  | "issue-draft"
  | "issue-finalize"
  | "issue-plan"
  | "issue-prepare"
  | "issue-run"
  | "pr-prepare-review"
  | "pr-resolve-conflicts";

type LaunchStageNoticeDefinition = {
  tier: "advanced" | "beta";
  command: string;
  reason: string;
  recommendedFirst: string;
  constraints: string;
};

const NOTICE_BORDER = "!".repeat(78);

const LAUNCH_STAGE_NOTICE_DEFINITIONS: Record<
  LaunchStageNoticeId,
  LaunchStageNoticeDefinition
> = {
  "feature-backlog": {
    tier: "beta",
    command: "`prs review features`",
    reason:
      "Repository-wide feature discovery is still a higher-variance workflow than the primary review and testing paths.",
    recommendedFirst: "`prs review tests --top 5` or `prs review`.",
    constraints:
      "Scans the target repository heuristically; optional issue creation uses the configured forge and needs issue-creation access.",
  },
  "issue-batch": {
    tier: "beta",
    command: "`prs issue batch ...`",
    reason:
      "It chains unattended issue-to-PR runs; the current sequential batch remains beta while parallel Superpowers-backed issue work is the target.",
    recommendedFirst:
      "Codex + Superpowers + GitHub audit for issue work, or `prs review` and PR fix workflows for narrower changes.",
    constraints:
      'Requires a clean working tree, at least two issue numbers, authenticated GitHub access, and `ai.runtime.type: "codex"`.',
  },
  "issue-draft": {
    tier: "advanced",
    command: "`prs issue draft`",
    reason:
      "It depends on interactive runtime judgment and broader repository exploration to turn an idea into an implementation-ready issue.",
    recommendedFirst:
      "`prs review`, `prs pr fix-comments <pr-number>`, or `prs review tests --top 5`.",
    constraints:
      "Requires an available interactive runtime CLI on PATH (configured runtime or Codex fallback) and writes draft artifacts under `.prs/`.",
  },
  "issue-finalize": {
    tier: "advanced",
    command: "`prs issue finalize <number>`",
    reason:
      "It assumes you are already in the wider issue automation flow and are ready to review a generated commit proposal.",
    recommendedFirst:
      "`prs review` and the PR fix workflows before moving into full issue automation.",
    constraints:
      "Requires local file changes to review and a usable text provider to draft the proposed commit message.",
  },
  "issue-plan": {
    tier: "advanced",
    command: "`prs issue plan <number> [--refresh]`",
    reason:
      "It prepares issue-plan comments for the wider issue-to-PR automation path rather than the primary review and fix loop.",
    recommendedFirst:
      "`prs review` first, then move into issue automation once the team trusts the narrower path.",
    constraints:
      "Requires issue access through the configured forge; creating or refreshing a managed plan comment also needs a usable text provider and GitHub authentication.",
  },
  "issue-prepare": {
    tier: "advanced",
    command: "`prs issue prepare <number>`",
    reason:
      "It stages full issue automation by switching branches and generating run artifacts before code work starts.",
    recommendedFirst:
      "`prs review` and the PR fix workflows before preparing a full issue run.",
    constraints:
      "Requires a clean working tree, GitHub issue access, and will check out and pull the configured base branch.",
  },
  "issue-run": {
    tier: "advanced",
    command: "`prs issue <number>`",
    reason:
      "This is the legacy issue automation path until it fully uses the Codex + Superpowers + GitHub audit contract.",
    recommendedFirst:
      "Codex + Superpowers + GitHub audit for issue work, or `prs review`, `prs pr fix-comments <pr-number>`, and `prs pr fix-tests <pr-number>` for narrower PR work.",
    constraints:
      'Requires a clean working tree, issue access through the configured forge, and a usable text provider; interactive runs need an available runtime CLI, while `--mode unattended` also needs authenticated GitHub access and `ai.runtime.type: "codex"`.',
  },
  "pr-prepare-review": {
    tier: "beta",
    command: "`prs pr prepare-review <pr-number>`",
    reason:
      "It automates reviewer workspace setup, base-branch sync, and a live Codex handoff around a pull request.",
    recommendedFirst:
      "`prs review` for the lower-risk review path, then `prs pr fix-comments <pr-number>` or `prs pr fix-tests <pr-number>` when you want guided local changes.",
    constraints:
      "Requires a clean working tree, pull-request access through the configured forge, and `codex` on PATH; it may check out a review branch and merge the latest base branch before generating the brief.",
  },
  "pr-resolve-conflicts": {
    tier: "beta",
    command: "`prs pr resolve-conflicts <pr-number>`",
    reason:
      "It syncs a live PR branch with its base branch and opens a focused Codex session when merge conflicts need guided local resolution.",
    recommendedFirst:
      "`prs pr fix-comments <pr-number>` or `prs pr fix-tests <pr-number>` when the PR is mergeable and you want guided local changes.",
    constraints:
      "Requires a clean working tree, pull-request access through the configured forge, `codex` on PATH, a fetchable origin base branch, and a PR head branch that can be pushed back to origin.",
  },
};

export function formatLaunchStageNotice(id: LaunchStageNoticeId): string {
  const definition = LAUNCH_STAGE_NOTICE_DEFINITIONS[id];
  const heading =
    definition.tier === "beta"
      ? "BETA WORKFLOW NOTICE"
      : "ADVANCED WORKFLOW NOTICE";

  return [
    NOTICE_BORDER,
    heading,
    definition.command,
    `Why: ${definition.reason}`,
    `Recommended first: ${definition.recommendedFirst}`,
    `Constraints: ${definition.constraints}`,
    NOTICE_BORDER,
  ].join("\n");
}
