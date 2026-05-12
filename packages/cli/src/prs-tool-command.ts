export type PrsToolCommand =
  | { kind: "issue-list"; actionable: boolean; json: boolean }
  | { kind: "issue-ready"; issueNumber: number; all: boolean; json: boolean }
  | { kind: "pr-list"; actionable: boolean; json: boolean }
  | { kind: "pr-prepare-review"; prNumber: number; json: boolean }
  | { kind: "pr-ready"; prNumber: number; all: boolean; json: boolean };

export function renderPrsToolCommandHelp(): string {
  return [
    "Usage:",
    "  prs tool issue list [--actionable] --json",
    "  prs tool issue ready <issue-number> [--all] --json",
    "  prs tool pr list [--actionable] --json",
    "  prs tool pr prepare-review <pr-number> --json",
    "  prs tool pr ready <pr-number> [--all] --json",
  ].join("\n");
}

function parseToolNumber(rawValue: string | undefined, label: "issue" | "pr"): number {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid prs tool ${label} number: "${rawValue ?? ""}".`);
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid prs tool ${label} number: "${rawValue}".`);
  }

  return parsed;
}

export function parsePrsToolCommandArgs(args: string[]): PrsToolCommand {
  const [scope, command, third, fourth, ...rest] = args;

  if (!command || (scope !== "issue" && scope !== "pr")) {
    throw new Error(renderPrsToolCommandHelp());
  }

  if (scope === "issue") {
    if (command === "list") {
      if (rest.length > 0) {
        throw new Error(renderPrsToolCommandHelp());
      }
      if (third === "--actionable" && fourth === "--json") {
        return { kind: "issue-list", actionable: true, json: true };
      }
      if (third === "--json" && !fourth) {
        return { kind: "issue-list", actionable: false, json: true };
      }
      throw new Error(renderPrsToolCommandHelp());
    }

    if (command === "ready") {
      if (!third || third === "--json" || third === "--all") {
        throw new Error(renderPrsToolCommandHelp());
      }

      const issueNumber = parseToolNumber(third, "issue");
      if (fourth === "--json" && rest.length === 0) {
        return { kind: "issue-ready", issueNumber, all: false, json: true };
      }
      if (fourth === "--all" && rest[0] === "--json" && rest.length === 1) {
        return { kind: "issue-ready", issueNumber, all: true, json: true };
      }
      throw new Error(renderPrsToolCommandHelp());
    }

    throw new Error(renderPrsToolCommandHelp());
  }

  if (command === "list") {
    if (rest.length > 0) {
      throw new Error(renderPrsToolCommandHelp());
    }
    if (third === "--actionable" && fourth === "--json") {
      return { kind: "pr-list", actionable: true, json: true };
    }
    if (third === "--json" && !fourth) {
      return { kind: "pr-list", actionable: false, json: true };
    }
    throw new Error(renderPrsToolCommandHelp());
  }

  if (command === "prepare-review") {
    if (rest.length > 0) {
      throw new Error(renderPrsToolCommandHelp());
    }
    if (!third || third === "--json") {
      throw new Error(renderPrsToolCommandHelp());
    }

    const prNumber = parseToolNumber(third, "pr");
    if (fourth !== "--json") {
      throw new Error(renderPrsToolCommandHelp());
    }

    return { kind: "pr-prepare-review", prNumber, json: true };
  }

  if (command === "ready") {
    if (!third || third === "--json" || third === "--all") {
      throw new Error(renderPrsToolCommandHelp());
    }

    const prNumber = parseToolNumber(third, "pr");
    if (fourth === "--json" && rest.length === 0) {
      return { kind: "pr-ready", prNumber, all: false, json: true };
    }
    if (fourth === "--all" && rest[0] === "--json" && rest.length === 1) {
      return { kind: "pr-ready", prNumber, all: true, json: true };
    }
    throw new Error(renderPrsToolCommandHelp());
  }

  throw new Error(renderPrsToolCommandHelp());
}
