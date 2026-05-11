import { describe, expect, it } from "vitest";
import {
  parsePrsCommandSurfaceArgs,
  renderPrsCommandSurfaceHelp,
  routePrsCommandSurfaceAction,
} from "./prs-command-surface";

describe("prs command surface", () => {
  it("parses root interactive command", () => {
    expect(parsePrsCommandSurfaceArgs([])).toEqual({ kind: "root", mode: "interactive" });
  });

  it("parses interactive issue picker", () => {
    expect(parsePrsCommandSurfaceArgs(["issue"])).toEqual({
      kind: "issue",
      mode: "interactive",
    });
  });

  it("parses direct issue work", () => {
    expect(parsePrsCommandSurfaceArgs(["issue", "123"])).toEqual({
      kind: "issue",
      mode: "direct",
      issueNumber: 123,
      action: "work",
    });
  });

  it("parses direct issue subactions", () => {
    expect(parsePrsCommandSurfaceArgs(["issue", "123", "refine"])).toEqual({
      kind: "issue",
      mode: "direct",
      issueNumber: 123,
      action: "refine",
    });
    expect(parsePrsCommandSurfaceArgs(["issue", "123", "plan"])).toEqual({
      kind: "issue",
      mode: "direct",
      issueNumber: 123,
      action: "plan",
    });
    expect(parsePrsCommandSurfaceArgs(["issue", "123", "finish"])).toEqual({
      kind: "issue",
      mode: "direct",
      issueNumber: 123,
      action: "finish",
    });
  });

  it("parses interactive PR picker and direct PR dashboard", () => {
    expect(parsePrsCommandSurfaceArgs(["pr"])).toEqual({ kind: "pr", mode: "interactive" });
    expect(parsePrsCommandSurfaceArgs(["pr", "456"])).toEqual({
      kind: "pr",
      mode: "direct",
      prNumber: 456,
      action: "choose",
    });
  });

  it("parses direct PR actions in object-first order", () => {
    expect(parsePrsCommandSurfaceArgs(["pr", "456", "resolve-conflicts"])).toEqual({
      kind: "pr",
      mode: "direct",
      prNumber: 456,
      action: "resolve-conflicts",
    });
    expect(parsePrsCommandSurfaceArgs(["pr", "456", "prepare-review"])).toEqual({
      kind: "pr",
      mode: "direct",
      prNumber: 456,
      action: "prepare-review",
    });
    expect(parsePrsCommandSurfaceArgs(["pr", "456", "fix-comments"])).toEqual({
      kind: "pr",
      mode: "direct",
      prNumber: 456,
      action: "fix-comments",
    });
    expect(parsePrsCommandSurfaceArgs(["pr", "456", "fix-failing-tests"])).toEqual({
      kind: "pr",
      mode: "direct",
      prNumber: 456,
      action: "fix-failing-tests",
    });
    expect(parsePrsCommandSurfaceArgs(["pr", "456", "fix-tests"])).toEqual({
      kind: "pr",
      mode: "direct",
      prNumber: 456,
      action: "fix-tests",
    });
  });

  it("parses audit publish and finish", () => {
    expect(parsePrsCommandSurfaceArgs(["audit", "publish"])).toEqual({
      kind: "audit",
      action: "publish",
      passthroughArgs: [],
    });
    expect(
      parsePrsCommandSurfaceArgs([
        "audit",
        "publish",
        "--issue",
        "123",
        "--file",
        ".prs/runs/example/spec.md",
        "--section",
        "Spec",
      ])
    ).toEqual({
      kind: "audit",
      action: "publish",
      passthroughArgs: [
        "--issue",
        "123",
        "--file",
        ".prs/runs/example/spec.md",
        "--section",
        "Spec",
      ],
    });
    expect(parsePrsCommandSurfaceArgs(["finish"])).toEqual({ kind: "finish" });
  });

  it("rejects unsupported forms with command help", () => {
    expect(() => parsePrsCommandSurfaceArgs(["pr", "resolve-conflicts", "456"])).toThrow(
      renderPrsCommandSurfaceHelp()
    );
    expect(() => parsePrsCommandSurfaceArgs(["issue", "abc"])).toThrow(
      "Invalid /prs issue number"
    );
    expect(() => parsePrsCommandSurfaceArgs(["unknown"])).toThrow(renderPrsCommandSurfaceHelp());
  });
});

describe("prs command surface routing", () => {
  it("routes issue actions to existing CLI commands and skills", () => {
    expect(routePrsCommandSurfaceAction({ kind: "issue", mode: "interactive" })).toEqual({
      interaction: "interactive",
      skillName: "prs:start-issue-work",
      cliArgs: undefined,
    });
    expect(
      routePrsCommandSurfaceAction({
        kind: "issue",
        mode: "direct",
        issueNumber: 123,
        action: "work",
      })
    ).toEqual({
      interaction: "direct",
      skillName: "prs:start-issue-work",
      cliArgs: ["issue", "123"],
    });
    expect(
      routePrsCommandSurfaceAction({
        kind: "issue",
        mode: "direct",
        issueNumber: 123,
        action: "refine",
      })
    ).toEqual({
      interaction: "direct",
      skillName: "prs:start-issue-work",
      cliArgs: ["issue", "refine", "123"],
    });
    expect(
      routePrsCommandSurfaceAction({
        kind: "issue",
        mode: "direct",
        issueNumber: 123,
        action: "plan",
      })
    ).toEqual({
      interaction: "direct",
      skillName: "prs:start-issue-work",
      cliArgs: ["issue", "plan", "123"],
    });
  });

  it("routes PR actions to existing CLI commands", () => {
    expect(
      routePrsCommandSurfaceAction({
        kind: "pr",
        mode: "direct",
        prNumber: 456,
        action: "resolve-conflicts",
      })
    ).toEqual({
      interaction: "direct",
      skillName: "prs",
      cliArgs: ["pr", "resolve-conflicts", "456"],
    });
    expect(
      routePrsCommandSurfaceAction({
        kind: "pr",
        mode: "direct",
        prNumber: 456,
        action: "fix-comments",
      })
    ).toEqual({
      interaction: "direct",
      skillName: "prs",
      cliArgs: ["pr", "fix-comments", "456"],
    });
  });

  it("routes audit and finish actions", () => {
    expect(
      routePrsCommandSurfaceAction({
        kind: "audit",
        action: "publish",
        passthroughArgs: ["--issue", "123"],
      })
    ).toEqual({
      interaction: "direct",
      skillName: "prs:publish-audit",
      cliArgs: ["audit", "publish", "--issue", "123"],
    });
    expect(routePrsCommandSurfaceAction({ kind: "finish" })).toEqual({
      interaction: "interactive",
      skillName: "prs:finish-work",
      cliArgs: undefined,
    });
  });
});
