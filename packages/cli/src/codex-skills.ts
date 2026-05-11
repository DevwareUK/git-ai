import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export type ManagedCodexSkill = {
  folderName: string;
  name: string;
  description: string;
  body: string;
};

export type InstalledCodexSkillsResult = {
  root: string;
  installed: number;
  skillFiles: string[];
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
    folderName: "prs",
    name: "prs",
    description:
      "Use as the unified prs workflow router for /prs, /prs issue, /prs pr, /prs audit, and /prs finish in prs-configured repositories.",
    body: [
      SHARED_WORKFLOW_CONTRACT,
      "",
      "## Unified /prs Router",
      "",
      "Use this as the single front door for prs-configured repository work.",
      "",
      "### Interactive forms",
      "",
      "- `/prs`: inspect repository state and offer likely next actions.",
      "- `/prs issue`: show actionable for me open issues. One selection starts issue work; multiple selections start parallel issue work through Superpowers agents and worktrees.",
      "- `/prs pr`: show actionable for me open pull requests and then offer contextual PR actions.",
      "",
      "### Direct forms",
      "",
      "- `/prs issue <number>`: start work on the issue.",
      "- `/prs issue <number> refine`: refine the issue.",
      "- `/prs issue <number> plan`: publish or refresh the issue plan.",
      "- `/prs issue <number> finish`: finish work with the issue context preserved.",
      "- `/prs pr <number>`: choose an action for the PR.",
      "- `/prs pr <number> prepare-review`: run `prs pr prepare-review <number>`.",
      "- `/prs pr <number> resolve-conflicts`: run `prs pr resolve-conflicts <number>`.",
      "- `/prs pr <number> fix-comments`: run `prs pr fix-comments <number>`.",
      "- `/prs pr <number> fix-failing-tests`: run `prs pr fix-failing-tests <number>`.",
      "- `/prs pr <number> fix-tests`: run `prs pr fix-tests <number>`.",
      "- `/prs audit publish`: publish specs, plans, decisions, verification notes, or completion summaries.",
      "- `/prs finish`: verify, commit, push, open or update a PR, publish final audit, and clean up only when safe.",
      "",
      "Existing managed skills are backing behaviors:",
      "- `prs:start-issue-work` backs `/prs issue`.",
      "- `prs:parallel-batch` backs multi-select `/prs issue`.",
      "- `prs:publish-audit` backs `/prs audit publish`.",
      "- `prs:finish-work` backs `/prs finish`.",
    ].join("\n"),
  },
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
  env: { CODEX_HOME?: string } = process.env,
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

export function installManagedCodexSkills(
  env: { CODEX_HOME?: string } = process.env,
  home = homedir()
): InstalledCodexSkillsResult {
  const root = resolveCodexSkillsRoot(env, home);
  const skillFiles: string[] = [];

  for (const skill of PRS_CODEX_SKILLS) {
    const skillDir = resolve(root, skill.folderName);
    const skillFile = resolve(skillDir, "SKILL.md");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, renderCodexSkillMarkdown(skill), "utf8");
    skillFiles.push(skillFile);
  }

  return {
    root,
    installed: skillFiles.length,
    skillFiles,
  };
}
