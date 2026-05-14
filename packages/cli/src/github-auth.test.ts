import { describe, expect, it, vi } from "vitest";
import {
  formatGitHubAuthDiagnostics,
  resolveGitHubCli,
  resolveGitHubToken,
} from "./github-auth";

describe("GitHub auth resolution", () => {
  it("uses an env token without requiring gh", () => {
    const spawnSync = vi.fn();
    const runCommand = vi.fn();

    const result = resolveGitHubToken({
      env: {
        GH_TOKEN: "  env-token  ",
      },
      runCommand,
      spawnSync,
    });

    expect(result.token).toBe("env-token");
    expect(result.diagnostics.tokenSource).toBe("GH_TOKEN");
    expect(spawnSync).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("finds an authenticated gh executable outside PATH", () => {
    const spawnSync = vi.fn((command: string) => ({
      status: command === "/opt/homebrew/bin/gh" ? 0 : 1,
    }));
    const runCommand = vi.fn((command: string, args: string[]) => {
      if (command === "/opt/homebrew/bin/gh" && args.join(" ") === "auth token") {
        return "gh-token";
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    });

    const cli = resolveGitHubCli({
      env: {
        PATH: "/usr/bin:/bin",
      },
      spawnSync,
    });

    expect(cli.path).toBe("/opt/homebrew/bin/gh");
    expect(cli.source).toBe("common-path");

    const token = resolveGitHubToken({
      env: {
        PATH: "/usr/bin:/bin",
      },
      runCommand,
      spawnSync,
    });

    expect(token.token).toBe("gh-token");
    expect(token.diagnostics.tokenSource).toBe("gh");
    expect(runCommand).toHaveBeenCalledWith("/opt/homebrew/bin/gh", ["auth", "token"]);
  });

  it("prefers a configured gh executable before PATH and common locations", () => {
    const spawnSync = vi.fn((command: string) => ({
      status: command === "/custom/bin/gh" ? 0 : 1,
    }));

    const result = resolveGitHubCli({
      configuredPath: "/custom/bin/gh",
      env: {
        PATH: "/usr/bin:/bin",
      },
      spawnSync,
    });

    expect(result.path).toBe("/custom/bin/gh");
    expect(result.source).toBe("config");
  });

  it("reports attempted auth paths when no env token or gh token is available", () => {
    const spawnSync = vi.fn(() => ({
      status: 1,
      error: new Error("not found"),
    }));

    const result = resolveGitHubToken({
      env: {
        PATH: "/usr/bin:/bin",
      },
      runCommand: vi.fn(),
      spawnSync,
    });

    expect(result.token).toBeUndefined();
    expect(formatGitHubAuthDiagnostics(result.diagnostics)).toContain("GH_TOKEN present: no");
    expect(formatGitHubAuthDiagnostics(result.diagnostics)).toContain(
      "GITHUB_TOKEN present: no"
    );
    expect(formatGitHubAuthDiagnostics(result.diagnostics)).toContain(
      "gh candidates tried:"
    );
    expect(formatGitHubAuthDiagnostics(result.diagnostics)).toContain(
      "/opt/homebrew/bin/gh"
    );
  });
});
