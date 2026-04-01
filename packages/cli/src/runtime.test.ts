import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { selectInteractiveRuntime } from "./runtime";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

describe("selectInteractiveRuntime", () => {
  it("selects Claude Code when it is configured and available", () => {
    vi.mocked(spawnSync).mockImplementation((command) => {
      if (command === "claude") {
        return { status: 0 } as never;
      }

      return { status: 1, error: new Error("unexpected") } as never;
    });

    const runtime = selectInteractiveRuntime({
      type: "claude-code",
    });

    expect(runtime.type).toBe("claude-code");
    expect(runtime.displayName).toBe("Claude Code");
  });

  it("falls back to Codex when the configured Claude Code runtime is unavailable", () => {
    const onFallback = vi.fn();

    vi.mocked(spawnSync).mockImplementation((command) => {
      if (command === "claude") {
        return { status: 1, error: new Error("missing") } as never;
      }

      if (command === "codex") {
        return { status: 0 } as never;
      }

      return { status: 1, error: new Error("unexpected") } as never;
    });

    const runtime = selectInteractiveRuntime(
      {
        type: "claude-code",
      },
      {
        onFallback,
      }
    );

    expect(runtime.type).toBe("codex");
    expect(onFallback).toHaveBeenCalledWith(
      'Configured runtime "Claude Code" is unavailable because the `claude` CLI is not available on PATH. Falling back to the default runtime "Codex".'
    );
  });

  it("fails clearly when neither the configured runtime nor the default runtime is available", () => {
    vi.mocked(spawnSync).mockImplementation((command) => {
      if (command === "claude" || command === "codex") {
        return { status: 1, error: new Error("missing") } as never;
      }

      return { status: 1, error: new Error("unexpected") } as never;
    });

    expect(() =>
      selectInteractiveRuntime({
        type: "claude-code",
      })
    ).toThrow(
      'Configured runtime "Claude Code" is unavailable because the `claude` CLI is not available on PATH. The default runtime "Codex" is also unavailable because the `codex` CLI is not available on PATH.'
    );
  });
});
