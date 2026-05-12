import { resolve } from "node:path";
import { resolveRuntimeRepoRoot } from "../repo-root";

export type BacklogOutputFormat = "json" | "markdown";

export type TestBacklogCommandOptions = {
  repoRoot: string;
  format: BacklogOutputFormat;
  top: number;
  createIssues: boolean;
  maxIssues: number;
  labels: string[];
};

export type FeatureBacklogCommandOptions = {
  repoRoot: string;
  format: BacklogOutputFormat;
  top: number;
  createIssues: boolean;
  maxIssues: number;
  labels: string[];
};

const TEST_BACKLOG_USAGE = [
  "Usage:",
  "  prs test-backlog [--format <markdown|json>] [--top <count>]",
  "  prs review tests [--format <markdown|json>] [--top <count>]",
  "                       [--repo-root <path>] [--create-issues]",
  "                       [--max-issues <count>] [--label <name>] [--labels <a,b>]",
].join("\n");

const FEATURE_BACKLOG_USAGE = [
  "Usage:",
  "  prs feature-backlog [repo-path] [--format <markdown|json>] [--top <count>]",
  "  prs review features [repo-path] [--format <markdown|json>] [--top <count>]",
  "                          [--create-issues] [--max-issues <count>]",
  "                          [--label <name>] [--labels <a,b>]",
].join("\n");

function parsePositiveInteger(value: string | undefined, flagName: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid value for ${flagName}: "${value ?? ""}". Expected a positive integer.`);
  }

  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid value for ${flagName}: "${value}". Expected a positive integer.`);
  }

  return parsedValue;
}

export function parseTestBacklogCommandArgs(args: string[]): TestBacklogCommandOptions {
  const normalizedArgs =
    args[0] === "review" && args[1] === "tests"
      ? ["test-backlog", ...args.slice(2)]
      : args;
  const optionArgs = normalizedArgs.slice(1);
  let repoRoot = resolveRuntimeRepoRoot();
  let format: BacklogOutputFormat = "markdown";
  let top = 5;
  let createIssues = false;
  let maxIssues = 3;
  const labels = new Set<string>();

  for (let index = 0; index < optionArgs.length; index += 1) {
    const rawArg = optionArgs[index];

    if (rawArg === "--repo-root") {
      const rawRepoRoot = optionArgs[index + 1];
      if (!rawRepoRoot) {
        throw new Error(`Missing value for --repo-root. ${TEST_BACKLOG_USAGE}`);
      }
      repoRoot = resolve(process.cwd(), rawRepoRoot);
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--repo-root=")) {
      const rawRepoRoot = rawArg.slice("--repo-root=".length);
      if (!rawRepoRoot) {
        throw new Error(`Missing value for --repo-root. ${TEST_BACKLOG_USAGE}`);
      }
      repoRoot = resolve(process.cwd(), rawRepoRoot);
      continue;
    }

    if (rawArg === "--format") {
      const rawFormat = optionArgs[index + 1];
      if (rawFormat !== "json" && rawFormat !== "markdown") {
        throw new Error(`Invalid format "${rawFormat ?? ""}". ${TEST_BACKLOG_USAGE}`);
      }
      format = rawFormat;
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--format=")) {
      const rawFormat = rawArg.slice("--format=".length);
      if (rawFormat !== "json" && rawFormat !== "markdown") {
        throw new Error(`Invalid format "${rawFormat}". ${TEST_BACKLOG_USAGE}`);
      }
      format = rawFormat;
      continue;
    }

    if (rawArg === "--top") {
      top = parsePositiveInteger(optionArgs[index + 1], "--top");
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--top=")) {
      top = parsePositiveInteger(rawArg.slice("--top=".length), "--top");
      continue;
    }

    if (rawArg === "--create-issues") {
      createIssues = true;
      continue;
    }

    if (rawArg === "--max-issues") {
      maxIssues = parsePositiveInteger(optionArgs[index + 1], "--max-issues");
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--max-issues=")) {
      maxIssues = parsePositiveInteger(
        rawArg.slice("--max-issues=".length),
        "--max-issues"
      );
      continue;
    }

    if (rawArg === "--label") {
      const label = optionArgs[index + 1]?.trim();
      if (!label) {
        throw new Error(`Missing value for --label. ${TEST_BACKLOG_USAGE}`);
      }
      labels.add(label);
      index += 1;
      continue;
    }

    if (rawArg === "--labels") {
      const rawLabels = optionArgs[index + 1];
      if (!rawLabels) {
        throw new Error(`Missing value for --labels. ${TEST_BACKLOG_USAGE}`);
      }
      for (const label of rawLabels.split(",")) {
        const trimmed = label.trim();
        if (trimmed) {
          labels.add(trimmed);
        }
      }
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--labels=")) {
      for (const label of rawArg.slice("--labels=".length).split(",")) {
        const trimmed = label.trim();
        if (trimmed) {
          labels.add(trimmed);
        }
      }
      continue;
    }

    throw new Error(`Unknown test-backlog option "${rawArg}". ${TEST_BACKLOG_USAGE}`);
  }

  return {
    repoRoot,
    format,
    top,
    createIssues,
    maxIssues: Math.min(maxIssues, top),
    labels: [...labels],
  };
}

export function parseFeatureBacklogCommandArgs(args: string[]): FeatureBacklogCommandOptions {
  const normalizedArgs =
    args[0] === "review" && args[1] === "features"
      ? ["feature-backlog", ...args.slice(2)]
      : args;
  const optionArgs = normalizedArgs.slice(1);
  let repoRoot = resolveRuntimeRepoRoot();
  let format: BacklogOutputFormat = "markdown";
  let top = 5;
  let createIssues = false;
  let maxIssues = 3;
  const labels = new Set<string>();
  let repoPathWasSet = false;

  for (let index = 0; index < optionArgs.length; index += 1) {
    const rawArg = optionArgs[index];

    if (!rawArg.startsWith("-")) {
      if (repoPathWasSet) {
        throw new Error(`Unknown feature-backlog argument "${rawArg}". ${FEATURE_BACKLOG_USAGE}`);
      }

      repoRoot = resolve(rawArg);
      repoPathWasSet = true;
      continue;
    }

    if (rawArg === "--format") {
      const rawFormat = optionArgs[index + 1];
      if (rawFormat !== "json" && rawFormat !== "markdown") {
        throw new Error(`Invalid format "${rawFormat ?? ""}". ${FEATURE_BACKLOG_USAGE}`);
      }
      format = rawFormat;
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--format=")) {
      const rawFormat = rawArg.slice("--format=".length);
      if (rawFormat !== "json" && rawFormat !== "markdown") {
        throw new Error(`Invalid format "${rawFormat}". ${FEATURE_BACKLOG_USAGE}`);
      }
      format = rawFormat;
      continue;
    }

    if (rawArg === "--top") {
      top = parsePositiveInteger(optionArgs[index + 1], "--top");
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--top=")) {
      top = parsePositiveInteger(rawArg.slice("--top=".length), "--top");
      continue;
    }

    if (rawArg === "--create-issues") {
      createIssues = true;
      continue;
    }

    if (rawArg === "--max-issues") {
      maxIssues = parsePositiveInteger(optionArgs[index + 1], "--max-issues");
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--max-issues=")) {
      maxIssues = parsePositiveInteger(
        rawArg.slice("--max-issues=".length),
        "--max-issues"
      );
      continue;
    }

    if (rawArg === "--label") {
      const label = optionArgs[index + 1]?.trim();
      if (!label) {
        throw new Error(`Missing value for --label. ${FEATURE_BACKLOG_USAGE}`);
      }
      labels.add(label);
      index += 1;
      continue;
    }

    if (rawArg === "--labels") {
      const rawLabels = optionArgs[index + 1];
      if (!rawLabels) {
        throw new Error(`Missing value for --labels. ${FEATURE_BACKLOG_USAGE}`);
      }
      for (const label of rawLabels.split(",")) {
        const trimmed = label.trim();
        if (trimmed) {
          labels.add(trimmed);
        }
      }
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--labels=")) {
      for (const label of rawArg.slice("--labels=".length).split(",")) {
        const trimmed = label.trim();
        if (trimmed) {
          labels.add(trimmed);
        }
      }
      continue;
    }

    throw new Error(`Unknown feature-backlog option "${rawArg}". ${FEATURE_BACKLOG_USAGE}`);
  }

  return {
    repoRoot,
    format,
    top,
    createIssues,
    maxIssues: Math.min(maxIssues, top),
    labels: [...labels],
  };
}
