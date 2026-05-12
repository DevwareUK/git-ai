import { describe, expect, it } from "vitest";
import { parsePrsToolCommandArgs, renderPrsToolCommandHelp } from "./prs-tool-command";

describe("prs tool command parser", () => {
  it("parses actionable issue list JSON command", () => {
    expect(parsePrsToolCommandArgs(["issue", "list", "--actionable", "--json"])).toEqual({
      kind: "issue-list",
      actionable: true,
      json: true,
    });
  });

  it("parses issue ready JSON command", () => {
    expect(parsePrsToolCommandArgs(["issue", "ready", "151", "--json"])).toEqual({
      kind: "issue-ready",
      issueNumber: 151,
      all: false,
      json: true,
    });
    expect(parsePrsToolCommandArgs(["issue", "ready", "151", "--all", "--json"])).toEqual({
      kind: "issue-ready",
      issueNumber: 151,
      all: true,
      json: true,
    });
  });

  it("parses actionable PR list JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "list", "--actionable", "--json"])).toEqual({
      kind: "pr-list",
      actionable: true,
      json: true,
    });
  });

  it("parses full PR list JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "list", "--json"])).toEqual({
      kind: "pr-list",
      actionable: false,
      json: true,
    });
  });

  it("parses PR prepare-review JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "prepare-review", "115", "--json"])).toEqual({
      kind: "pr-prepare-review",
      prNumber: 115,
      json: true,
    });
  });

  it("parses PR ready JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "ready", "115", "--json"])).toEqual({
      kind: "pr-ready",
      prNumber: 115,
      all: false,
      json: true,
    });
    expect(parsePrsToolCommandArgs(["pr", "ready", "115", "--all", "--json"])).toEqual({
      kind: "pr-ready",
      prNumber: 115,
      all: true,
      json: true,
    });
  });

  it("rejects non-numeric PR numbers", () => {
    expect(() => parsePrsToolCommandArgs(["pr", "prepare-review", "abc", "--json"])).toThrow(
      'Invalid prs tool pr number: "abc".'
    );
    expect(() => parsePrsToolCommandArgs(["issue", "ready", "abc", "--json"])).toThrow(
      'Invalid prs tool issue number: "abc".'
    );
  });

  it("rejects unsupported forms with help", () => {
    expect(() => parsePrsToolCommandArgs(["pr", "list"])).toThrow(renderPrsToolCommandHelp());
    expect(() => parsePrsToolCommandArgs(["pr", "list", "--actionable"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["pr", "checkout"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["pr", "prepare-review", "--json"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["issue", "list"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["unknown"])).toThrow(renderPrsToolCommandHelp());
  });
});
