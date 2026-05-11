export type PrsToolCommand =
  { kind: "pr-prepare-review"; prNumber: number; json: boolean };

export function renderPrsToolCommandHelp(): string {
  return [
    "Usage:",
    "  prs tool pr prepare-review <pr-number> --json",
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

export function parsePrsToolCommandArgs(args: string[]): PrsToolCommand {
  const [scope, command, third, fourth, ...rest] = args;

  if (scope !== "pr" || !command || rest.length > 0) {
    throw new Error(renderPrsToolCommandHelp());
  }

  if (command === "prepare-review") {
    if (!third || third === "--json") {
      throw new Error(renderPrsToolCommandHelp());
    }

    const prNumber = parsePrNumber(third);
    if (fourth !== "--json") {
      throw new Error(renderPrsToolCommandHelp());
    }

    return { kind: "pr-prepare-review", prNumber, json: true };
  }

  throw new Error(renderPrsToolCommandHelp());
}
