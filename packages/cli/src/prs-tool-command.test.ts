import { describe, expect, it } from "vitest";
import { parsePrsToolCommandArgs, renderPrsToolCommandHelp } from "./prs-tool-command";

describe("prs tool command parser", () => {
  it("parses PR prepare-review JSON command", () => {
    expect(parsePrsToolCommandArgs(["pr", "prepare-review", "115", "--json"])).toEqual({
      kind: "pr-prepare-review",
      prNumber: 115,
      json: true,
    });
  });

  it("rejects non-numeric PR numbers", () => {
    expect(() => parsePrsToolCommandArgs(["pr", "prepare-review", "abc", "--json"])).toThrow(
      'Invalid prs tool pr number: "abc".'
    );
  });

  it("rejects unsupported forms with help", () => {
    expect(() => parsePrsToolCommandArgs(["pr", "list"])).toThrow(renderPrsToolCommandHelp());
    expect(() => parsePrsToolCommandArgs(["pr", "checkout"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["pr", "prepare-review", "--json"])).toThrow(
      renderPrsToolCommandHelp()
    );
    expect(() => parsePrsToolCommandArgs(["unknown"])).toThrow(renderPrsToolCommandHelp());
  });
});
