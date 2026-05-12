import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  REPO_ROOT,
  cleanupTargets,
  createTestBacklogAnalysis,
  captureStdout,
  readLatestRunMetadata,
  createMockCodexHome,
  withRepositoryConfig,
  loadCli,
} from "./index-test-support";

describe("Repository configuration errors", () => {
  it("fails clearly when .prs/config.json contains malformed JSON", async () => {
    await withRepositoryConfig("{invalid-json", async () => {
      const { run } = await loadCli({
        analysisResult: createTestBacklogAnalysis(),
      });

      process.argv = ["node", "prs", "test-backlog", "--create-issues"];

      await expect(run()).rejects.toThrow("Failed to parse .prs/config.json");
    });
  });

  it("fails clearly when .prs/config.json contains an empty buildCommand", async () => {
    await withRepositoryConfig(
      JSON.stringify({ buildCommand: [] }, null, 2),
      async () => {
        const { run } = await loadCli({
          analysisResult: createTestBacklogAnalysis(),
        });

        process.argv = ["node", "prs", "test-backlog", "--create-issues"];

        await expect(run()).rejects.toThrow("Invalid .prs/config.json");
      }
    );
  });

  it("fails clearly when .prs/config.json contains an unsupported forge type", async () => {
    await withRepositoryConfig(
      JSON.stringify({ forge: { type: "gitlab" } }, null, 2),
      async () => {
        const { run } = await loadCli({
          analysisResult: createTestBacklogAnalysis(),
        });

        process.argv = ["node", "prs", "test-backlog", "--create-issues"];

        await expect(run()).rejects.toThrow("Invalid .prs/config.json");
      }
    );
  });

  it("fails full issue runs clearly when forge.type is none", async () => {
    await withRepositoryConfig(
      JSON.stringify({ forge: { type: "none" } }, null, 2),
      async () => {
        const { run } = await loadCli();

        process.argv = ["node", "prs", "issue", "42"];

        await expect(run()).rejects.toThrow(
          "Repository forge support is disabled by .prs/config.json"
        );
      }
    );
  });

  it("fails issue plan runs clearly when forge.type is none", async () => {
    await withRepositoryConfig(
      JSON.stringify({ forge: { type: "none" } }, null, 2),
      async () => {
        const { run } = await loadCli();

        process.argv = ["node", "prs", "issue", "plan", "42"];

        await expect(run()).rejects.toThrow(
          "Repository forge support is disabled by .prs/config.json"
        );
      }
    );
  });

  it("fails backlog issue creation clearly when forge.type is none", async () => {
    await withRepositoryConfig(
      JSON.stringify({ forge: { type: "none" } }, null, 2),
      async () => {
        const { run } = await loadCli({
          analysisResult: createTestBacklogAnalysis(),
        });

        process.argv = ["node", "prs", "test-backlog", "--create-issues"];

        await expect(run()).rejects.toThrow(
          "Repository forge support is disabled by .prs/config.json"
        );
      }
    );
  });

  it("skips draft issue creation with a clear message when forge.type is none", async () => {
    createMockCodexHome();
    await withRepositoryConfig(
      JSON.stringify({ forge: { type: "none" } }, null, 2),
      async () => {
        const { run } = await loadCli({
          readlineAnswers: ["Unify PR assistant outputs."],
          spawnSyncImpl: (command, args) => {
            if (command === "codex" && args[0] === "--version") {
              return { status: 0 };
            }

            if (command === "codex") {
              const { metadata } = readLatestRunMetadata();
              writeFileSync(
                resolve(REPO_ROOT, metadata.draftFile as string),
                "# Unify PR assistant outputs.\n\n## Summary\nKeep a single managed PR assistant section.\n",
                "utf8"
              );

              return { status: 0 };
            }

            throw new Error(`Unexpected spawnSync call: ${command}`);
          },
        });

        process.argv = ["node", "prs", "issue", "draft", "--runtime"];

        const messages: string[] = [];
        const stdout = captureStdout();
        vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
          messages.push(String(message ?? ""));
        });
        await run();

        const { runDir, metadata } = readLatestRunMetadata();
        cleanupTargets.add(resolve(REPO_ROOT, ".prs", "runs", runDir));
        if (metadata.draftFile) {
          cleanupTargets.add(resolve(REPO_ROOT, metadata.draftFile));
        }

        expect(messages.join("\n")).toContain(
          "Issue creation skipped because repository forge support is disabled by .prs/config.json."
        );
        expect(stdout.output()).toContain("Generated issue draft");
        expect(stdout.output()).toContain("# Unify PR assistant outputs.");
      }
    );
  });

});
