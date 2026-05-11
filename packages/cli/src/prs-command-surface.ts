export type PrsIssueAction = "work" | "refine" | "plan" | "finish";
export type PrsPrAction =
  | "choose"
  | "prepare-review"
  | "resolve-conflicts"
  | "fix-comments"
  | "fix-failing-tests"
  | "fix-tests";

export type PrsCommandSurfaceAction =
  | { kind: "root"; mode: "interactive" }
  | { kind: "issue"; mode: "interactive" }
  | { kind: "issue"; mode: "direct"; issueNumber: number; action: PrsIssueAction }
  | { kind: "pr"; mode: "interactive" }
  | { kind: "pr"; mode: "direct"; prNumber: number; action: PrsPrAction }
  | { kind: "audit"; action: "publish"; passthroughArgs: string[] }
  | { kind: "finish" };

export type PrsCommandRoute = {
  interaction: "interactive" | "direct";
  skillName:
    | "prs"
    | "prs:start-issue-work"
    | "prs:parallel-batch"
    | "prs:publish-audit"
    | "prs:finish-work";
  cliArgs?: string[];
};

const ISSUE_ACTIONS = new Set(["refine", "plan", "finish"]);
const PR_ACTIONS = new Set([
  "prepare-review",
  "resolve-conflicts",
  "fix-comments",
  "fix-failing-tests",
  "fix-tests",
]);

function parsePositiveNumber(rawValue: string | undefined, label: string): number {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid /prs ${label} number: "${rawValue ?? ""}".`);
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid /prs ${label} number: "${rawValue}".`);
  }

  return parsed;
}

export function renderPrsCommandSurfaceHelp(): string {
  return [
    "Usage:",
    "  /prs",
    "  /prs issue",
    "  /prs issue <number> [refine|plan|finish]",
    "  /prs pr",
    "  /prs pr <number> [prepare-review|resolve-conflicts|fix-comments|fix-failing-tests|fix-tests]",
    "  /prs audit publish [--issue <number>|--pr <number>] [--file <path>] [--section <name>] [--local-run <path>]",
    "  /prs finish",
  ].join("\n");
}

export function parsePrsCommandSurfaceArgs(args: string[]): PrsCommandSurfaceAction {
  const [first, second, third, ...rest] = args;

  if (!first) {
    return { kind: "root", mode: "interactive" };
  }

  if (first === "issue") {
    if (!second) {
      return { kind: "issue", mode: "interactive" };
    }
    if (rest.length > 0) {
      throw new Error(renderPrsCommandSurfaceHelp());
    }

    const issueNumber = parsePositiveNumber(second, "issue");
    if (!third) {
      return { kind: "issue", mode: "direct", issueNumber, action: "work" };
    }
    if (!ISSUE_ACTIONS.has(third)) {
      throw new Error(renderPrsCommandSurfaceHelp());
    }

    return {
      kind: "issue",
      mode: "direct",
      issueNumber,
      action: third as PrsIssueAction,
    };
  }

  if (first === "pr") {
    if (!second) {
      return { kind: "pr", mode: "interactive" };
    }
    if (rest.length > 0) {
      throw new Error(renderPrsCommandSurfaceHelp());
    }
    if (PR_ACTIONS.has(second)) {
      throw new Error(renderPrsCommandSurfaceHelp());
    }

    const prNumber = parsePositiveNumber(second, "pr");
    if (!third) {
      return { kind: "pr", mode: "direct", prNumber, action: "choose" };
    }
    if (!PR_ACTIONS.has(third)) {
      throw new Error(renderPrsCommandSurfaceHelp());
    }

    return {
      kind: "pr",
      mode: "direct",
      prNumber,
      action: third as PrsPrAction,
    };
  }

  if (first === "audit" && second === "publish") {
    return { kind: "audit", action: "publish", passthroughArgs: args.slice(2) };
  }

  if (first === "finish" && !second) {
    return { kind: "finish" };
  }

  throw new Error(renderPrsCommandSurfaceHelp());
}

export function routePrsCommandSurfaceAction(action: PrsCommandSurfaceAction): PrsCommandRoute {
  if (action.kind === "root") {
    return { interaction: "interactive", skillName: "prs", cliArgs: undefined };
  }

  if (action.kind === "issue") {
    if (action.mode === "interactive") {
      return { interaction: "interactive", skillName: "prs:start-issue-work", cliArgs: undefined };
    }

    if (action.action === "work") {
      return {
        interaction: "direct",
        skillName: "prs:start-issue-work",
        cliArgs: ["issue", String(action.issueNumber)],
      };
    }

    if (action.action === "refine") {
      return {
        interaction: "direct",
        skillName: "prs:start-issue-work",
        cliArgs: ["issue", "refine", String(action.issueNumber)],
      };
    }

    if (action.action === "plan") {
      return {
        interaction: "direct",
        skillName: "prs:start-issue-work",
        cliArgs: ["issue", "plan", String(action.issueNumber)],
      };
    }

    return { interaction: "interactive", skillName: "prs:finish-work", cliArgs: undefined };
  }

  if (action.kind === "pr") {
    if (action.mode === "interactive") {
      return { interaction: "interactive", skillName: "prs", cliArgs: undefined };
    }

    if (action.action === "choose") {
      return { interaction: "interactive", skillName: "prs", cliArgs: undefined };
    }

    return {
      interaction: "direct",
      skillName: "prs",
      cliArgs: ["pr", action.action, String(action.prNumber)],
    };
  }

  if (action.kind === "audit") {
    return {
      interaction: "direct",
      skillName: "prs:publish-audit",
      cliArgs: ["audit", "publish", ...action.passthroughArgs],
    };
  }

  return { interaction: "interactive", skillName: "prs:finish-work", cliArgs: undefined };
}
