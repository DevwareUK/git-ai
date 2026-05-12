export type CodexCommandOptions =
  | {
      action: "issue";
      issueNumber: number;
    }
  | {
      action: "issue-batch";
      issueNumbers: number[];
    }
  | {
      action: "pr-prepare-review";
      prNumber: number;
    }
  | {
      action: "pr-resolve-conflicts";
      prNumber: number;
    };

export const CODEX_USAGE = [
  "Usage:",
  "  prs codex issue <number>",
  "  prs codex issue batch <number> <number> [...number] [--mode unattended]",
  "  prs codex pr prepare-review <pr-number>",
  "  prs codex pr resolve-conflicts <pr-number>",
].join("\n");

function parseModeOption(rawArgs: string[]): "unattended" {
  let mode: string | undefined;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const rawArg = rawArgs[index];
    if (rawArg === "--mode") {
      mode = rawArgs[index + 1];
      if (!mode) {
        throw new Error(`Missing codex mode value. ${CODEX_USAGE}`);
      }
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--mode=")) {
      mode = rawArg.slice("--mode=".length);
      continue;
    }

    throw new Error(`Unknown codex option "${rawArg}". ${CODEX_USAGE}`);
  }

  if (mode !== undefined && mode !== "unattended") {
    throw new Error(`Invalid codex mode "${mode}". Expected "unattended".`);
  }

  return "unattended";
}

function parseBatchIssueNumbers(
  rawArgs: string[],
  parseNumber: (rawValue: string | undefined) => number
): number[] {
  const issueNumbers: number[] = [];
  const optionArgs: string[] = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const rawArg = rawArgs[index];
    if (rawArg === "--mode") {
      optionArgs.push(rawArg, rawArgs[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (rawArg.startsWith("--mode=")) {
      optionArgs.push(rawArg);
      continue;
    }

    if (rawArg.startsWith("--")) {
      throw new Error(`Unknown codex option "${rawArg}". ${CODEX_USAGE}`);
    }

    issueNumbers.push(parseNumber(rawArg));
  }

  parseModeOption(optionArgs);

  const uniqueIssueNumbers = [...new Set(issueNumbers)];
  if (uniqueIssueNumbers.length < 2) {
    throw new Error(`Codex batch issue runs require at least two issue numbers. ${CODEX_USAGE}`);
  }

  if (uniqueIssueNumbers.length !== issueNumbers.length) {
    throw new Error("Codex batch issue runs do not support duplicate issue numbers.");
  }

  return issueNumbers;
}

export function parseCodexCommandArgs(
  args: string[],
  parseNumber: (rawValue: string | undefined) => number
): CodexCommandOptions {
  const codexArgs = args[0] === "codex" ? args.slice(1) : args;
  const [scope, subcommand, target, ...rest] = codexArgs;

  if (scope === "issue") {
    if (subcommand === "batch") {
      return {
        action: "issue-batch",
        issueNumbers: parseBatchIssueNumbers(
          [target, ...rest].filter((value): value is string => value !== undefined),
          parseNumber
        ),
      };
    }

    parseModeOption([target, ...rest].filter((value): value is string => value !== undefined));
    return {
      action: "issue",
      issueNumber: parseNumber(subcommand),
    };
  }

  if (scope === "pr") {
    if (subcommand !== "prepare-review" && subcommand !== "resolve-conflicts") {
      throw new Error(CODEX_USAGE);
    }
    if (rest.length > 0) {
      throw new Error(`Unknown codex option "${rest[0]}". ${CODEX_USAGE}`);
    }

    return {
      action: subcommand === "prepare-review" ? "pr-prepare-review" : "pr-resolve-conflicts",
      prNumber: parseNumber(target),
    };
  }

  throw new Error(CODEX_USAGE);
}
