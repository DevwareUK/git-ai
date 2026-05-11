import { describe, expect, it } from "vitest";
import { parsePrsToolCommandArgs, renderPrsToolCommandHelp } from "./prs-tool-command";

describe("prs tool command parser", () => {
  it("parses actionable PR list JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "list", "--actionable", "--json"])).toEqual({
      kind: "pr-list",
      actionable: true,
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

  it("parses PR checkout JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "checkout", "115", "--json"])).toEqual({
      kind: "pr-checkout",
      prNumber: 115,
      json: true,
    });
  });

  it("parses PR sync-base JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "sync-base", "115", "--json"])).toEqual({
      kind: "pr-sync-base",
      prNumber: 115,
      json: true,
    });
  });

  it("rejects non-numeric PR numbers", () => {
    expect(() => parsePrsToolCommandArgs(["pr", "checkout", "abc", "--json"])).toThrow(
      'Invalid prs tool pr number: "abc".'
    );
  });

  it("rejects unsupported forms with help", () => {
    expect(() => parsePrsToolCommandArgs(["pr", "list"])).toThrow(renderPrsToolCommandHelp());
    expect(() => parsePrsToolCommandArgs(["pr", "checkout"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["pr", "checkout", "--json"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["unknown"])).toThrow(renderPrsToolCommandHelp());
  });
});
