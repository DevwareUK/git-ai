export type PrsToolCommand =
  | { kind: "pr-list"; actionable: boolean; json: boolean }
  | { kind: "pr-prepare-review"; prNumber: number; json: boolean }
  | { kind: "pr-checkout"; prNumber: number; json: boolean }
  | { kind: "pr-sync-base"; prNumber: number; json: boolean };

type PrsToolPrAction = "prepare-review" | "checkout" | "sync-base";

const PR_NUMBER_ACTIONS = new Set<PrsToolPrAction>([
  "prepare-review",
  "checkout",
  "sync-base",
]);

export function renderPrsToolCommandHelp(): string {
  return [
    "Usage:",
    "  prs tool pr list [--actionable] --json",
    "  prs tool pr prepare-review <pr-number> --json",
    "  prs tool pr checkout <pr-number> --json",
    "  prs tool pr sync-base <pr-number> --json",
  ].join("\n");
}

function parsePrNumber(rawValue: string | undefined): number {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid prs tool pr number: "${rawValue ?? ""}".`);
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid prs tool pr number: "${rawValue}".`);
  }

  return parsed;
}

function buildPrNumberCommand(action: PrsToolPrAction, prNumber: number): PrsToolCommand {
  if (action === "prepare-review") {
    return { kind: "pr-prepare-review", prNumber, json: true };
  }
  if (action === "checkout") {
    return { kind: "pr-checkout", prNumber, json: true };
  }

  return { kind: "pr-sync-base", prNumber, json: true };
}

export function parsePrsToolCommandArgs(args: string[]): PrsToolCommand {
  const [scope, command, third, fourth, ...rest] = args;

  if (scope !== "pr" || !command || rest.length > 0) {
    throw new Error(renderPrsToolCommandHelp());
  }

  if (command === "list") {
    if (third === "--actionable" && fourth === "--json") {
      return { kind: "pr-list", actionable: true, json: true };
    }
    if (third === "--json" && !fourth) {
      return { kind: "pr-list", actionable: false, json: true };
    }
    throw new Error(renderPrsToolCommandHelp());
  }

  if (PR_NUMBER_ACTIONS.has(command as PrsToolPrAction)) {
    if (!third || third === "--json") {
      throw new Error(renderPrsToolCommandHelp());
    }

    const prNumber = parsePrNumber(third);
    if (fourth !== "--json") {
      throw new Error(renderPrsToolCommandHelp());
    }

    return buildPrNumberCommand(command as PrsToolPrAction, prNumber);
  }

  throw new Error(renderPrsToolCommandHelp());
}
