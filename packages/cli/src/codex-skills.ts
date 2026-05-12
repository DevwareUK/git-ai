import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  parsePrsCommandSurfaceArgs,
  routePrsCommandSurfaceAction,
} from "./prs-command-surface";

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

export type CodexSkillRenderOptions = {
  cliFallbackCommand?: string[];
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

function renderPrPrepareReviewToolCommand(): string {
  const route = routePrsCommandSurfaceAction(
    parsePrsCommandSurfaceArgs(["pr", "123", "prepare-review"])
  );
  const cliArgs = route.cliArgs?.join(" ");
  if (!route.toolOnly || !cliArgs) {
    throw new Error("Expected /prs pr <number> prepare-review to route to a prs tool command.");
  }

  return `prs ${cliArgs.replace("123", "<number>")}`;
}

function renderIssueReadyToolCommand(all = false): string {
  const route = routePrsCommandSurfaceAction(
    parsePrsCommandSurfaceArgs(all ? ["issue", "123", "--all"] : ["issue", "123"])
  );
  const cliArgs = route.cliArgs?.join(" ");
  if (!cliArgs) {
    throw new Error("Expected /prs issue <number> to route through a prs tool command.");
  }

  return `prs ${cliArgs.replace("123", "<number>")}`;
}

function renderPrReadyToolCommand(all = false): string {
  const route = routePrsCommandSurfaceAction(
    parsePrsCommandSurfaceArgs(all ? ["pr", "123", "--all"] : ["pr", "123"])
  );
  const cliArgs = route.cliArgs?.join(" ");
  if (!route.toolOnly || !cliArgs) {
    throw new Error("Expected /prs pr <number> to route to a prs tool command.");
  }

  return `prs ${cliArgs.replace("123", "<number>")}`;
}

function formatShellCommandSegment(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

function formatCliFallbackCommand(command: string[]): string | undefined {
  const normalized = command.map((segment) => segment.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.map(formatShellCommandSegment).join(" ");
}

function renderSetupCapturedCliGuidance(options: CodexSkillRenderOptions): string[] {
  const formattedCommand = formatCliFallbackCommand(options.cliFallbackCommand ?? []);
  if (!formattedCommand) {
    return [];
  }

  return [
    `- Use the setup-captured fallback CLI as the primary Codex command path: \`${formattedCommand} <args>\`.`,
    `- Fast path for \`/prs issue\`: run \`${formattedCommand} tool issue list --actionable --json\` exactly once.`,
    `- Fast path for \`/prs pr\`: run \`${formattedCommand} tool pr list --actionable --json\` exactly once.`,
    "- Do not run `command -v prs`, `git status`, GitHub API fallbacks, SSH PR-ref discovery, or source-code inspection before this fast-path command.",
  ];
}

function renderGenericSetupCapturedCliGuidance(
  options: CodexSkillRenderOptions
): string[] {
  const formattedCommand = formatCliFallbackCommand(options.cliFallbackCommand ?? []);
  if (!formattedCommand) {
    return [];
  }

  return [
    "",
    "## Tooling Expectations",
    "",
    `- Use the setup-captured fallback CLI as the primary Codex command path: \`${formattedCommand} <args>\`.`,
    "- Do not report `prs` as unavailable solely because it is missing from PATH; use the setup-captured fallback command instead.",
    `- For audit publication, run \`${formattedCommand} audit publish --issue <number> --file <path> --section <name>\` or \`${formattedCommand} audit publish --pr <number> --file <path> --section <name>\`.`,
  ];
}

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
      "### Tooling expectations",
      "",
      "- Do not assume the GitHub CLI (`gh`) is installed in Codex sessions.",
      "- Prefer the installed `prs` command when it is on `PATH`.",
      "- In a prs source checkout where `prs` is not on `PATH`, run the repository-local CLI with `corepack pnpm --filter @prs/cli... build` and `node packages/cli/dist/index.js <args>`.",
      "- For GitHub metadata, prefer `GH_TOKEN` or `GITHUB_TOKEN`, then authenticated `gh` when available.",
      "- If no GitHub API authentication is available, SSH pull refs may identify candidate PR numbers, but do not call that an actionable-for-me list because assignees, review requests, checks, comments, and draft state are unavailable.",
      "- Never call commands that launch Codex from inside a Codex session.",
      "- Do not recreate prs workflows with ad hoc git commands when a deterministic `prs tool ...` command exists.",
      "- For `/prs issue`, run `prs tool issue list --actionable --json`; if it returns `status: \"blocked\"`, report its `message` and `nextAction` instead of inspecting git refs or source files.",
      "- For `/prs pr`, run `prs tool pr list --actionable --json`; if it returns `status: \"blocked\"`, report its `message` and `nextAction` instead of inspecting git refs or source files.",
      "",
      "### Interactive forms",
      "",
      "- `/prs`: inspect repository state and offer likely next actions.",
      "- `/prs create`: start the guided route for creating new GitHub work items from a rough idea.",
      "- `/prs create issue`: create one implementation-ready GitHub issue or a linked issue set from a rough idea. This currently uses the existing `prs issue draft` implementation.",
      "- `/prs issue`: run `prs tool issue list --actionable --json`, show actionable for me open issues, and then offer contextual issue actions. One selection prepares issue context; multiple selections start parallel issue work through Superpowers agents and worktrees.",
      "- `/prs pr`: run `prs tool pr list --actionable --json`, show the returned actionable pull requests, and then offer contextual PR actions.",
      "",
      "### Direct forms",
      "",
      `- \`/prs issue <number>\`: run \`${renderIssueReadyToolCommand()}\`; gather issue context, write readiness metadata, and stop with the next sensible action so Superpowers can create the implementation worktree.`,
      `- \`/prs issue <number> --all\`: run \`${renderIssueReadyToolCommand(true)}\`; if the result is ready, do not stop after the readiness JSON when \`--all\` is present. Instead, continue into Superpowers worktree creation and issue implementation from the updated base branch, publish approved spec/plan artifacts to GitHub audit, and then use \`/prs finish\` discipline for verification, commit, push, PR, audit, and safe cleanup.`,
      "- `/prs issue <number> refine`: refine the issue.",
      "- `/prs issue <number> plan`: publish or refresh the issue plan.",
      "- `/prs issue <number> finish`: finish work with the issue context preserved.",
      `- \`/prs pr <number>\`: run \`${renderPrReadyToolCommand()}\`; prepare the PR in the current repository checkout used by the user's normal local runtime, report base sync/runtime readiness, and stop with the next sensible action so the user can browse the app quickly. If the tool returns a local \`review/pr-<number>\` branch because the PR head branch is checked out in another worktree, stay in that current checkout and do not continue from the worktree.`,
      `- \`/prs pr <number> --all\`: run \`${renderPrReadyToolCommand(true)}\`; take all sensible readiness steps without prompting in the current repository checkout, including syncing the base branch and ensuring the configured local app runtime is running. Do not push, review, fix, approve, merge, or switch to an existing PR worktree.`,
      `- \`/prs pr <number> prepare-review\`: run \`${renderPrPrepareReviewToolCommand()}\`, keep the prepared branch checked out in the current repository, read the returned \`snapshotFilePath\` when useful, then continue review in this Codex session. The deterministic tool does not generate \`review-brief.md\`; do not look for one unless a separate command created it.`,
      "- `/prs pr <number> resolve-conflicts`: run `prs pr resolve-conflicts <number>`.",
      "- `/prs pr <number> fix-comments`: run `prs pr fix-comments <number>`.",
      "- `/prs pr <number> fix-failing-tests`: run `prs pr fix-failing-tests <number>`.",
      "- `/prs pr <number> fix-tests`: run `prs pr fix-tests <number>`.",
      "- `/prs audit publish`: publish specs, plans, decisions, verification notes, or completion summaries.",
      "- `/prs finish`: verify, commit, push, open or update a PR, publish final audit, and clean up only when safe.",
      "",
      "Existing managed skills are backing behaviors:",
      "- `prs:start-issue-work` backs `/prs create issue`, `/prs issue <number> refine`, and `/prs issue <number> plan`.",
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

export function renderCodexSkillMarkdown(
  skill: ManagedCodexSkill,
  options: CodexSkillRenderOptions = {}
): string {
  const bodyWithSkillGuidance =
    skill.name === "prs"
      ? skill.body.replace(
          "- Prefer the installed `prs` command when it is on `PATH`.",
          renderSetupCapturedCliGuidance(options).join("\n") ||
            "- Prefer the installed `prs` command when it is on `PATH`."
        )
      : skill.body;
  const body =
    skill.name === "prs"
      ? bodyWithSkillGuidance
      : bodyWithSkillGuidance.replace(
          SHARED_WORKFLOW_CONTRACT,
          [SHARED_WORKFLOW_CONTRACT, ...renderGenericSetupCapturedCliGuidance(options)].join("\n")
        );

  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    body.trim(),
    "",
  ].join("\n");
}

export function installManagedCodexSkills(
  env: { CODEX_HOME?: string } = process.env,
  home = homedir(),
  options: CodexSkillRenderOptions = {}
): InstalledCodexSkillsResult {
  const root = resolveCodexSkillsRoot(env, home);
  const skillFiles: string[] = [];

  for (const skill of PRS_CODEX_SKILLS) {
    const skillDir = resolve(root, skill.folderName);
    const skillFile = resolve(skillDir, "SKILL.md");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, renderCodexSkillMarkdown(skill, options), "utf8");
    skillFiles.push(skillFile);
  }

  return {
    root,
    installed: skillFiles.length,
    skillFiles,
  };
}
