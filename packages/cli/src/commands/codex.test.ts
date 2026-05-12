import { describe, expect, it } from "vitest";
import { CODEX_USAGE, parseCodexCommandArgs } from "./codex";

function parseNumber(rawValue: string | undefined): number {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid number: ${rawValue ?? ""}`);
  }

  return Number.parseInt(rawValue, 10);
}

describe("codex command parser", () => {
  it("parses an explicit unattended Codex issue launcher", () => {
    expect(parseCodexCommandArgs(["codex", "issue", "123"], parseNumber)).toEqual({
      action: "issue",
      issueNumber: 123,
    });
    expect(
      parseCodexCommandArgs(
        ["codex", "issue", "123", "--mode", "unattended"],
        parseNumber
      )
    ).toEqual({
      action: "issue",
      issueNumber: 123,
    });
  });

  it("parses explicit unattended Codex issue batches", () => {
    expect(
      parseCodexCommandArgs(
        ["codex", "issue", "batch", "123", "124", "--mode=unattended"],
        parseNumber
      )
    ).toEqual({
      action: "issue-batch",
      issueNumbers: [123, 124],
    });
  });

  it("parses explicit Codex PR launchers", () => {
    expect(
      parseCodexCommandArgs(["codex", "pr", "prepare-review", "115"], parseNumber)
    ).toEqual({
      action: "pr-prepare-review",
      prNumber: 115,
    });
    expect(
      parseCodexCommandArgs(["codex", "pr", "resolve-conflicts", "116"], parseNumber)
    ).toEqual({
      action: "pr-resolve-conflicts",
      prNumber: 116,
    });
  });

  it("rejects unsupported or ambiguous Codex forms", () => {
    expect(() =>
      parseCodexCommandArgs(["codex", "issue", "123", "--mode", "interactive"], parseNumber)
    ).toThrow('Invalid codex mode "interactive". Expected "unattended".');
    expect(() =>
      parseCodexCommandArgs(["codex", "issue", "123", "--mode"], parseNumber)
    ).toThrow("Missing codex mode value.");
    expect(() =>
      parseCodexCommandArgs(["codex", "issue", "batch", "123"], parseNumber)
    ).toThrow(CODEX_USAGE);
    expect(() =>
      parseCodexCommandArgs(["codex", "pr", "fix-comments", "115"], parseNumber)
    ).toThrow(CODEX_USAGE);
  });
});
