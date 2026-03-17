import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../..");
const ORIGINAL_ARGV = [...process.argv];
const cleanupTargets = new Set<string>();

function createTestBacklogAnalysis() {
  return {
    summary: "CLI and issue orchestration need direct integration coverage.",
    currentTestingSetup: {
      status: "partial" as const,
      hasTests: true,
      testFileCount: 4,
      frameworks: ["Vitest"],
      evidence: ["Vitest dependency in package.json"],
      testDirectories: ["packages/core/src", "packages/cli/src"],
      notes: ["CLI entrypoint coverage is still missing."],
      ciIntegration: {
        status: "partial" as const,
        hasGitHubActions: true,
        workflows: [".github/workflows/ci.yml"],
        evidence: ["GitHub Actions workflow runs pnpm test"],
        notes: ["Issue orchestration paths are not covered yet."],
      },
    },
    notableCoverageGaps: [
      "No integration coverage for git-ai issue prepare/finalize.",
      "No command-level coverage for test-backlog issue creation.",
    ],
    findings: [
      {
        id: "cli-issue-prepare",
        title: "Missing CLI integration coverage for issue prepare",
        priority: "high" as const,
        rationale: "Preparing issue runs creates downstream automation artifacts.",
        suggestedTestTypes: ["integration", "cli"] as const,
        relatedPaths: ["packages/cli/src/index.ts"],
        existingCoverage: "Argument parsing is covered, but command execution is not.",
        issueTitle: "Add CLI integration coverage for git-ai issue prepare",
        issueBody: "Exercise issue prepare against mocked git and GitHub boundaries.",
      },
      {
        id: "cli-test-backlog",
        title: "Missing CLI integration coverage for test-backlog output",
        priority: "high" as const,
        rationale: "The CLI needs stable output formatting and issue reuse behavior.",
        suggestedTestTypes: ["integration", "cli"] as const,
        relatedPaths: ["packages/cli/src/index.ts", "package.json"],
        existingCoverage: "Core backlog analysis is covered separately.",
        issueTitle: "Add CLI integration coverage for git-ai test-backlog",
        issueBody: "Verify JSON and markdown output plus duplicate issue reuse logic.",
      },
      {
        id: "cli-issue-finalize",
        title: "Missing failure coverage for issue finalize",
        priority: "medium" as const,
        rationale: "Finalize should fail clearly when Codex has not produced changes.",
        suggestedTestTypes: ["integration", "cli"] as const,
        relatedPaths: ["packages/cli/src/index.ts"],
        issueTitle: "Add failure coverage for git-ai issue finalize",
        issueBody: "Assert finalize surfaces incomplete run state clearly.",
      },
    ],
  };
}

function createFetchResponse(
  payload: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {}
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function captureStdout(): { output: () => string } {
  const chunks: string[] = [];

  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  return {
    output: () => chunks.join(""),
  };
}

async function loadCli(options: {
  analysisResult?: ReturnType<typeof createTestBacklogAnalysis>;
  execFileSyncImpl?: (command: string, args: string[]) => string;
  spawnSyncImpl?: (command: string, args: string[]) => { status: number; error?: Error };
} = {}) {
  vi.resetModules();
  process.env.GIT_AI_DISABLE_AUTO_RUN = "1";

  const analyzeTestBacklog = vi.fn();
  if (options.analysisResult) {
    analyzeTestBacklog.mockResolvedValue(options.analysisResult);
  }

  const execFileSync = vi.fn((command: string, args: string[]) => {
    if (options.execFileSyncImpl) {
      return options.execFileSyncImpl(command, args);
    }

    throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
  });
  const spawnSync = vi.fn((command: string, args: string[]) => {
    if (options.spawnSyncImpl) {
      return options.spawnSyncImpl(command, args);
    }

    return { status: 0 };
  });

  vi.doMock("@git-ai/core", () => ({
    analyzeTestBacklog,
    generateCommitMessage: vi.fn(),
    generateDiffSummary: vi.fn(),
  }));
  vi.doMock("node:child_process", () => ({
    execFileSync,
    spawnSync,
  }));

  const module = await import("./index");

  return {
    run: module.run,
    analyzeTestBacklog,
    execFileSync,
    spawnSync,
  };
}

afterEach(() => {
  process.argv = [...ORIGINAL_ARGV];
  delete process.env.GIT_AI_DISABLE_AUTO_RUN;
  delete process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;

  for (const target of cleanupTargets) {
    rmSync(target, { recursive: true, force: true });
  }
  cleanupTargets.clear();

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("CLI integration", () => {
  it("parses repo-level test-backlog flags for the CLI", async () => {
    process.env.GIT_AI_DISABLE_AUTO_RUN = "1";
    const { parseTestBacklogCommandArgs } = await import("./index");

    const options = parseTestBacklogCommandArgs([
      "test-backlog",
      "--format",
      "json",
      "--top",
      "4",
      "--create-issues",
      "--max-issues",
      "8",
      "--label",
      "tests",
      "--labels",
      "cli, smoke",
      "--repo-root",
      "packages/core",
    ]);

    expect(options.format).toBe("json");
    expect(options.top).toBe(4);
    expect(options.createIssues).toBe(true);
    expect(options.maxIssues).toBe(4);
    expect(options.labels).toEqual(["tests", "cli", "smoke"]);
    expect(options.repoRoot).toMatch(/packages\/core$/);
  });

  it("runs test-backlog in JSON mode and reuses duplicate GitHub issues", async () => {
    const analysis = createTestBacklogAnalysis();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            number: 41,
            title: analysis.findings[0].issueTitle,
            html_url: "https://github.com/DevwareUK/git-ai/issues/41",
          },
        ])
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 42,
          title: analysis.findings[1].issueTitle,
          html_url: "https://github.com/DevwareUK/git-ai/issues/42",
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 43,
          title: analysis.findings[2].issueTitle,
          html_url: "https://github.com/DevwareUK/git-ai/issues/43",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run, analyzeTestBacklog } = await loadCli({
      analysisResult: analysis,
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "remote") {
          return "git@github.com:DevwareUK/git-ai.git\n";
        }

        throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.env.GITHUB_TOKEN = "test-token";
    process.argv = [
      "node",
      "git-ai",
      "test-backlog",
      "--format",
      "json",
      "--top",
      "3",
      "--create-issues",
      "--max-issues",
      "3",
      "--label",
      "tests",
    ];

    const stdout = captureStdout();
    await run();

    expect(analyzeTestBacklog).toHaveBeenCalledWith({
      repoRoot: REPO_ROOT,
      maxFindings: 3,
    });

    const output = JSON.parse(stdout.output()) as {
      findings: Array<{ issueTitle: string }>;
      createdIssues: Array<{ number: number; title: string; status: string }>;
    };

    expect(output.findings.map((finding) => finding.issueTitle)).toEqual(
      analysis.findings.map((finding) => finding.issueTitle)
    );
    expect(output.createdIssues).toEqual([
      {
        number: 41,
        title: analysis.findings[0].issueTitle,
        url: "https://github.com/DevwareUK/git-ai/issues/41",
        status: "existing",
      },
      {
        number: 42,
        title: analysis.findings[1].issueTitle,
        url: "https://github.com/DevwareUK/git-ai/issues/42",
        status: "created",
      },
      {
        number: 43,
        title: analysis.findings[2].issueTitle,
        url: "https://github.com/DevwareUK/git-ai/issues/43",
        status: "created",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("renders test-backlog markdown output", async () => {
    const analysis = createTestBacklogAnalysis();
    const { run, analyzeTestBacklog } = await loadCli({
      analysisResult: analysis,
    });

    process.argv = ["node", "git-ai", "test-backlog", "--top", "2"];

    const stdout = captureStdout();
    await run();

    expect(analyzeTestBacklog).toHaveBeenCalledWith({
      repoRoot: REPO_ROOT,
      maxFindings: 2,
    });
    expect(stdout.output()).toContain("# AI Test Backlog");
    expect(stdout.output()).toContain("## Summary");
    expect(stdout.output()).toContain("### Missing CLI integration coverage for issue prepare");
    expect(stdout.output()).toContain(
      "- Draft issue title: Add CLI integration coverage for git-ai issue prepare"
    );
  });

  it("fails test-backlog issue creation clearly when no GitHub token is configured", async () => {
    const { run } = await loadCli({
      analysisResult: createTestBacklogAnalysis(),
    });

    process.env.GITHUB_TOKEN = "";
    process.env.GH_TOKEN = "";
    process.argv = ["node", "git-ai", "test-backlog", "--create-issues"];

    await expect(run()).rejects.toThrow(
      "Creating GitHub issues requires GH_TOKEN or GITHUB_TOKEN to be set."
    );
  });

  it("prepares an issue run and writes automation artifacts", async () => {
    const issueNumber = 91234;
    const issueTitle = "CLI issue prepare integration fixture";
    const outputDir = mkdtempSync(resolve(tmpdir(), "git-ai-cli-issue-prepare-"));
    const githubOutputPath = resolve(outputDir, "github-output.txt");
    writeFileSync(githubOutputPath, "");
    cleanupTargets.add(outputDir);

    const fetchMock = vi.fn().mockResolvedValue(
      createFetchResponse({
        title: issueTitle,
        body: "Ensure issue prepare writes the expected workspace files.",
        html_url: `https://github.com/DevwareUK/git-ai/issues/${issueNumber}`,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          return "";
        }

        if (command === "git" && args[0] === "remote") {
          return "git@github.com:DevwareUK/git-ai.git\n";
        }

        throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
      },
      spawnSyncImpl: (command, args) => {
        if (command === "gh" && args[0] === "--version") {
          return { status: 1, error: new Error("gh is unavailable") };
        }

        if (command === "git" && args[0] === "rev-parse") {
          return { status: 1 };
        }

        if (command === "git" && args[0] === "checkout" && args[1] === "-b") {
          return { status: 0 };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.env.GITHUB_OUTPUT = githubOutputPath;
    process.argv = [
      "node",
      "git-ai",
      "issue",
      "prepare",
      String(issueNumber),
      "--mode",
      "github-action",
    ];

    const stdout = captureStdout();
    await run();

    const output = JSON.parse(stdout.output()) as {
      branchName: string;
      issueFile: string;
      promptFile: string;
      metadataFile: string;
      outputLog: string;
      runDir: string;
      mode: string;
    };
    const issueFilePath = resolve(REPO_ROOT, output.issueFile);
    const promptFilePath = resolve(REPO_ROOT, output.promptFile);
    const metadataFilePath = resolve(REPO_ROOT, output.metadataFile);
    const outputLogPath = resolve(REPO_ROOT, output.outputLog);
    const runDirPath = resolve(REPO_ROOT, output.runDir);

    cleanupTargets.add(dirname(issueFilePath));
    cleanupTargets.add(runDirPath);

    expect(output.branchName).toBe("feat/issue-91234-cli-issue-prepare-integration-fixture");
    expect(output.mode).toBe("github-action");
    expect(readFileSync(issueFilePath, "utf8")).toContain(`- Issue number: ${issueNumber}`);
    expect(readFileSync(issueFilePath, "utf8")).toContain(`- Title: ${issueTitle}`);
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "You are running inside a GitHub Actions workflow via Codex."
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      `Read the issue snapshot at \`${output.issueFile}\` before making changes.`
    );
    expect(readFileSync(outputLogPath, "utf8")).toContain("# git-ai issue run log");
    expect(JSON.parse(readFileSync(metadataFilePath, "utf8"))).toMatchObject({
      issueNumber,
      issueTitle,
      branchName: output.branchName,
      issueFile: output.issueFile,
      promptFile: output.promptFile,
      outputLog: output.outputLog,
      mode: "github-action",
    });
    expect(readFileSync(githubOutputPath, "utf8")).toContain("branch_name<<");
    expect(readFileSync(githubOutputPath, "utf8")).toContain(output.branchName);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails issue finalize clearly when no generated changes exist", async () => {
    const { run } = await loadCli({
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          return "";
        }

        throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "git-ai", "issue", "finalize", "29"];

    await expect(run()).rejects.toThrow(
      "Codex completed without producing any file changes to commit."
    );
  });
});
