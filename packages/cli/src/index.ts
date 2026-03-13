#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { generateCommitMessage, generateDiffSummary } from "@git-ai/core";
import { OpenAIProvider } from "@git-ai/providers";
import dotenv from "dotenv";

dotenv.config({ path: resolve(__dirname, "../../..", ".env"), quiet: true });

type IssueDetails = {
  title: string;
  body: string;
  url: string;
};

const ISSUE_USAGE = 'Usage: git-ai issue <number>';

function getCliArgs(): string[] {
  return process.argv.slice(2).filter((arg) => arg !== "--");
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (name === "OPENAI_API_KEY") {
      throw new Error(
        "OPENAI_API_KEY is required. Set it in your environment or in a .env file."
      );
    }

    throw new Error(`${name} is required.`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readGitDiff(
  args: string[],
  emptyDiffMessage: string,
  commandDescription: string,
  missingRevisionMessage?: string
): string {
  try {
    const diff = execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (!diff.trim()) {
      throw new Error(emptyDiffMessage);
    }

    return diff;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === emptyDiffMessage) {
      throw error;
    }

    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : undefined;
    const combinedMessage = [error instanceof Error ? error.message : "", stderr]
      .filter(Boolean)
      .join(" ");

    if (
      missingRevisionMessage &&
      (combinedMessage.includes("ambiguous argument 'HEAD'") ||
        combinedMessage.includes("bad revision 'HEAD'"))
    ) {
      throw new Error(missingRevisionMessage);
    }

    const detail = stderr ? ` ${stderr}` : "";
    throw new Error(
      `Failed to read ${commandDescription} git diff. Make sure git is installed and you are inside a git repository.${detail}`
    );
  }
}

function readStagedDiff(): string {
  return readGitDiff(
    ["diff", "--cached"],
    "No staged changes found. Stage changes before generating a commit message.",
    "staged"
  );
}

function readHeadDiff(): string {
  return readGitDiff(
    ["diff", "HEAD"],
    "No changes found in git diff HEAD. Make a change before generating a diff summary.",
    "HEAD",
    "git diff HEAD requires at least one commit. Create an initial commit before generating a diff summary."
  );
}

function runCommand(
  command: string,
  args: string[],
  errorMessage: string
): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error: unknown) {
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : undefined;
    const detail = stderr ? ` ${stderr}` : "";
    throw new Error(`${errorMessage}${detail}`);
  }
}

function runInteractiveCommand(
  command: string,
  args: string[],
  errorMessage: string
): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`${errorMessage} ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(errorMessage);
  }
}

function canRunCommand(command: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(command, args, {
    stdio: "ignore",
  });

  return !result.error && result.status === 0;
}

function hasChanges(): boolean {
  return runCommand(
    "git",
    ["status", "--porcelain"],
    "Failed to inspect the working tree."
  ).length > 0;
}

function ensureCleanWorkingTree(): void {
  if (hasChanges()) {
    throw new Error(
      "Working tree is not clean. Commit or stash existing changes before running `git-ai issue`."
    );
  }
}

function parseIssueNumber(rawValue: string | undefined): number {
  if (!rawValue) {
    throw new Error(`Missing issue number. ${ISSUE_USAGE}`);
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid issue number "${rawValue}". ${ISSUE_USAGE}`);
  }

  const issueNumber = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid issue number "${rawValue}". ${ISSUE_USAGE}`);
  }

  return issueNumber;
}

function parseGitHubRepoFromRemote(): { owner: string; repo: string } {
  const remoteUrl = runCommand(
    "git",
    ["remote", "get-url", "origin"],
    "Failed to resolve the origin remote."
  );

  const match = remoteUrl.match(
    /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/
  );

  if (!match) {
    throw new Error(
      "Could not determine the GitHub repository from the origin remote."
    );
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function tryFetchIssueWithGh(issueNumber: number): IssueDetails | undefined {
  if (!canRunCommand("gh")) {
    return undefined;
  }

  try {
    const payload = runCommand(
      "gh",
      [
        "issue",
        "view",
        String(issueNumber),
        "--json",
        "title,body,url",
      ],
      `Failed to fetch GitHub issue #${issueNumber} with gh.`
    );

    const parsed = JSON.parse(payload) as Partial<IssueDetails>;
    if (!parsed.title || !parsed.url) {
      throw new Error("Issue payload was incomplete.");
    }

    return {
      title: parsed.title,
      body: parsed.body ?? "",
      url: parsed.url,
    };
  } catch {
    return undefined;
  }
}

async function fetchIssueWithApi(issueNumber: number): Promise<IssueDetails> {
  const { owner, repo } = parseGitHubRepoFromRemote();
  const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "git-ai-cli",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      headers,
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub issue #${issueNumber} via GitHub API (${response.status} ${response.statusText}).`
    );
  }

  const payload = (await response.json()) as {
    title?: string;
    body?: string | null;
    html_url?: string;
  };

  if (!payload.title || !payload.html_url) {
    throw new Error(
      `GitHub issue #${issueNumber} did not return the required fields.`
    );
  }

  return {
    title: payload.title,
    body: payload.body ?? "",
    url: payload.html_url,
  };
}

async function fetchIssueDetails(issueNumber: number): Promise<IssueDetails> {
  const ghIssue = tryFetchIssueWithGh(issueNumber);
  if (ghIssue) {
    return ghIssue;
  }

  return fetchIssueWithApi(issueNumber);
}

function slugifyIssueTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
}

function createIssueBranchName(issueNumber: number, title: string): string {
  const slug = slugifyIssueTitle(title) || `issue-${issueNumber}`;
  return `feat/issue-${issueNumber}-${slug}`;
}

function ensureBranchDoesNotExist(branchName: string): void {
  const result = spawnSync("git", ["rev-parse", "--verify", branchName], {
    stdio: "ignore",
  });

  if (!result.error && result.status === 0) {
    throw new Error(`Branch "${branchName}" already exists.`);
  }
}

function buildCodexPrompt(issueNumber: number, issue: IssueDetails): string {
  const issueBody = issue.body.trim() || "(No issue body provided.)";

  return [
    "You are working in the git-ai repository.",
    "",
    "Issue context:",
    `- issue number: ${issueNumber}`,
    `- title: ${issue.title}`,
    `- url: ${issue.url}`,
    "- body:",
    issueBody,
    "",
    "Instructions to Codex:",
    "- analyze the repository",
    "- implement a solution to the issue",
    "- modify the necessary files",
    "- ensure the project builds",
    "- follow existing architecture patterns",
    "- run build/tests if available",
    "- keep changes minimal and focused",
    "",
    "Output expectations:",
    "- working code changes",
    "- passing build",
    "- sensible commit message",
  ].join("\n");
}

function runCodex(prompt: string): void {
  if (!canRunCommand("codex")) {
    throw new Error(
      "The `codex` CLI is not available on PATH. Install it before running `git-ai issue`."
    );
  }

  runInteractiveCommand(
    "codex",
    ["exec", prompt],
    "Codex execution failed."
  );
}

function verifyBuild(): void {
  if (!canRunCommand("pnpm")) {
    throw new Error("The `pnpm` CLI is not available on PATH.");
  }

  runInteractiveCommand("pnpm", ["build"], "Build failed. Changes were not committed.");
}

function commitIssueChanges(issueNumber: number): void {
  if (!hasChanges()) {
    throw new Error("Codex completed without producing any file changes to commit.");
  }

  runInteractiveCommand("git", ["add", "."], "Failed to stage the generated changes.");
  runInteractiveCommand(
    "git",
    ["commit", "-m", `feat: address issue #${issueNumber}`],
    "Failed to create the issue commit."
  );
}

function isGhAuthenticated(): boolean {
  if (!canRunCommand("gh")) {
    return false;
  }

  const result = spawnSync("gh", ["auth", "status"], {
    stdio: "ignore",
  });

  return !result.error && result.status === 0;
}

function pushBranchAndCreatePr(
  branchName: string,
  issueNumber: number,
  issueTitle: string
): void {
  runInteractiveCommand(
    "git",
    ["push", "-u", "origin", branchName],
    `Failed to push branch "${branchName}".`
  );
  runInteractiveCommand(
    "gh",
    [
      "pr",
      "create",
      "--title",
      `Fix: ${issueTitle}`,
      "--body",
      `Closes #${issueNumber}`,
      "--base",
      "main",
    ],
    "Failed to create a pull request."
  );
}

function printManualPrInstructions(branchName: string, issueNumber: number): void {
  console.log("");
  console.log("GitHub CLI is unavailable or not authenticated.");
  console.log("To push and open a PR manually, run:");
  console.log(`  git push -u origin ${branchName}`);
  console.log(
    `  gh pr create --title "Fix: <issue title>" --body "Closes #${issueNumber}" --base main`
  );
}

function formatCommitMessage(title: string, body?: string): string {
  return body ? `${title}\n\n${body}\n` : `${title}\n`;
}

function formatDiffSummary(
  summary: Awaited<ReturnType<typeof generateDiffSummary>>
): string {
  const sections = [
    "Changes Overview",
    summary.summary,
    "",
    "Major Areas Affected",
  ];

  for (const area of summary.majorAreas) {
    sections.push(`- ${area}`);
  }

  if (summary.riskAreas && summary.riskAreas.length > 0) {
    sections.push("", "Potential Risk Areas");
    for (const risk of summary.riskAreas) {
      sections.push(`- ${risk}`);
    }
  }

  sections.push("");
  return sections.join("\n");
}

function createProvider(): OpenAIProvider {
  return new OpenAIProvider({
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
    model: getOptionalEnv("OPENAI_MODEL"),
    baseUrl: getOptionalEnv("OPENAI_BASE_URL"),
  });
}

async function runIssueCommand(): Promise<void> {
  const args = getCliArgs();
  const issueNumber = parseIssueNumber(args[1]);
  ensureCleanWorkingTree();
  console.log(`Fetching GitHub issue #${issueNumber}...`);
  const issue = await fetchIssueDetails(issueNumber);

  const branchName = createIssueBranchName(issueNumber, issue.title);
  ensureBranchDoesNotExist(branchName);

  console.log(`Creating branch ${branchName}...`);
  runInteractiveCommand(
    "git",
    ["checkout", "-b", branchName],
    `Failed to create branch "${branchName}".`
  );

  console.log("Running Codex locally...");
  const prompt = buildCodexPrompt(issueNumber, issue);
  runCodex(prompt);

  console.log("Verifying build...");
  verifyBuild();

  console.log("Committing generated changes...");
  commitIssueChanges(issueNumber);

  if (isGhAuthenticated()) {
    console.log("Pushing branch and opening a pull request...");
    pushBranchAndCreatePr(branchName, issueNumber, issue.title);
    return;
  }

  printManualPrInstructions(branchName, issueNumber);
}

async function run(): Promise<void> {
  const args = getCliArgs();
  const command = args[0] ?? "commit";
  if (command !== "commit" && command !== "diff" && command !== "issue") {
    throw new Error(
      `Unknown command: ${command}. Supported commands: "commit", "diff", "issue".`
    );
  }

  if (command === "commit") {
    const diff = readStagedDiff();
    const provider = createProvider();
    const result = await generateCommitMessage(provider, diff);
    process.stdout.write(formatCommitMessage(result.title, result.body));
    return;
  }

  if (command === "issue") {
    await runIssueCommand();
    return;
  }

  const diff = readHeadDiff();
  const provider = createProvider();
  const result = await generateDiffSummary(provider, { diff });
  process.stdout.write(formatDiffSummary(result));
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
