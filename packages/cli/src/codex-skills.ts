import { homedir } from "node:os";
import { resolve } from "node:path";

export type ManagedCodexSkill = {
  folderName: string;
  name: string;
  description: string;
  body: string;
};

const SHARED_WORKFLOW_CONTRACT = [
  "## prs Workflow Contract",
  "",
  "- Use Superpowers for brainstorming, planning, worktrees, agents, and verification.",
  "- Let Superpowers create and manage fresh git worktrees from an updated origin base branch.",
  "- Keep the user's current checkout separate from issue implementation work.",
  "- Publish specs, plans, decisions, and completion notes to GitHub through `prs audit publish`.",
  "- Keep raw prompts, logs, metadata, and local artifacts under `.prs/runs`.",
  "- Never commit generated Superpowers specs or plans to `docs/superpowers`.",
  "- Finish by verifying, committing, pushing, opening or updating a pull request, publishing final audit, and cleaning up only when safe.",
].join("\n");

export const PRS_CODEX_SKILLS: ManagedCodexSkill[] = [
  {
    folderName: "prs-start-issue-work",
    name: "prs:start-issue-work",
    description:
      "Use when starting GitHub issue work in a prs-configured repository; routes Codex through Superpowers worktrees and GitHub audit publication.",
    body: [
      SHARED_WORKFLOW_CONTRACT,
      "",
      "## Start Issue Work",
      "",
      "1. Read the repository `AGENTS.md` and `.prs/config.json` if present.",
      "2. Use Superpowers before implementation work.",
      "3. Instruct Superpowers to create the working git worktree from updated `origin/main` or the configured base branch.",
      "4. Reserve or reuse a `.prs/runs` workspace for local artifacts.",
      "5. Publish approved spec and plan artifacts to GitHub with `prs audit publish`.",
    ].join("\n"),
  },
  {
    folderName: "prs-publish-audit",
    name: "prs:publish-audit",
    description:
      "Use when publishing prs workflow specs, plans, decisions, verification notes, or completion summaries to GitHub audit comments.",
    body: [
      SHARED_WORKFLOW_CONTRACT,
      "",
      "## Publish Audit",
      "",
      "Use `prs audit publish --issue <number> --file <path> --section <name>` for issue artifacts.",
      "Use `prs audit publish --pr <number> --file <path> --section <name>` for pull request artifacts.",
      "If publication fails, report the artifact path and do not claim the workflow is complete.",
    ].join("\n"),
  },
  {
    folderName: "prs-finish-work",
    name: "prs:finish-work",
    description:
      "Use when finishing work in a prs-configured repository; verifies, commits, pushes, opens or updates PRs, and publishes final audit.",
    body: [
      SHARED_WORKFLOW_CONTRACT,
      "",
      "## Finish Work",
      "",
      "1. Use Superpowers verification-before-completion discipline.",
      "2. Run the repository configured verification command.",
      "3. Commit only reviewed implementation changes.",
      "4. Push the branch and open or update the pull request.",
      "5. Publish final verification and PR state with `prs audit publish`.",
      "6. Clean up a worktree only when no uncommitted or unpushed work would be lost.",
    ].join("\n"),
  },
  {
    folderName: "prs-parallel-batch",
    name: "prs:parallel-batch",
    description:
      "Use when running multiple independent prs issues; coordinates Superpowers agents and separate worktrees with GitHub audit trails.",
    body: [
      SHARED_WORKFLOW_CONTRACT,
      "",
      "## Parallel Batch",
      "",
      "Use Superpowers agent and worktree workflows for each independent issue.",
      "Keep each issue in its own branch, run workspace, and GitHub audit thread.",
      "Summarize each issue independently as running, PR opened, no changes, failed, or needs human review.",
    ].join("\n"),
  },
];

export function resolveCodexSkillsRoot(
  env: Pick<NodeJS.ProcessEnv, "CODEX_HOME"> = process.env,
  home = homedir()
): string {
  const codexHome = env.CODEX_HOME?.trim() || resolve(home, ".codex");
  return resolve(codexHome, "skills");
}

export function renderCodexSkillMarkdown(skill: ManagedCodexSkill): string {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    skill.body.trim(),
    "",
  ].join("\n");
}
