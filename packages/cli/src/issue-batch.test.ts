import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  REPO_ROOT,
  cleanupTargets,
  createIssueResolutionPlanResult,
  createFetchResponse,
  createMockChildProcess,
  listRunDirectories,
  readIssueBatchState,
  writeMockIssueWorktreeOutcome,
  createMockCodexHome,
  loadCli,
} from "./index-test-support";

describe("Issue batch workflow", () => {
  it("runs multi-issue work in child worktrees, records progress, and resumes incomplete issues", async () => {
    const beforeRuns = listRunDirectories();
    createMockCodexHome();
    const issueNumbers = [123, 124];
    const issueTitles = new Map([
      [123, "Multi issue first task"],
      [124, "Multi issue second task"],
    ]);
    const branchByIssue = new Map([
      [123, "feat/issue-123-multi-issue-first-task"],
      [124, "feat/issue-124-multi-issue-second-task"],
    ]);
    const batchStatePath = resolve(
      REPO_ROOT,
      ".prs",
      "batches",
      `issues-${issueNumbers.join("-")}.json`
    );

    for (const target of [
      resolve(REPO_ROOT, ".prs", "issues", "123"),
      resolve(REPO_ROOT, ".prs", "issues", "124"),
      resolve(REPO_ROOT, ".prs", "issues", "123-multi-issue-first-task"),
      resolve(REPO_ROOT, ".prs", "issues", "124-multi-issue-second-task"),
      batchStatePath,
    ]) {
      rmSync(target, { recursive: true, force: true });
      cleanupTargets.add(target);
    }

    const statusResponses = [
      "",
      " M packages/cli/src/index.ts\n",
      "",
      "",
      " M packages/cli/src/index.ts\n",
    ];
    const branches = new Set<string>();
    const codexIssues: number[] = [];
    const codexAttempts = new Map<number, number>();
    let activeIssueNumber: number | undefined;

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const issueMatch = url.match(/\/issues\/(\d+)$/);
      if (issueMatch) {
        const issueNumber = Number.parseInt(issueMatch[1] ?? "", 10);
        return createFetchResponse({
          title: issueTitles.get(issueNumber),
          body: `Implement issue ${issueNumber} through unattended batch orchestration.`,
          html_url: `https://github.com/DevwareUK/prs/issues/${issueNumber}`,
        });
      }

      if (url.includes("/comments?")) {
        return createFetchResponse([]);
      }

      const planCommentMatch = url.match(/\/issues\/(\d+)\/comments$/);
      if (planCommentMatch && init?.method === "POST") {
        const issueNumber = Number.parseInt(planCommentMatch[1] ?? "", 10);
        return createFetchResponse({
          id: 7000 + issueNumber,
          body: JSON.parse(String(init.body)).body,
          html_url:
            `https://github.com/DevwareUK/prs/issues/${issueNumber}#issuecomment-${7000 + issueNumber}`,
          updated_at: "2026-04-26T10:45:00Z",
        });
      }

      if (url.endsWith("/pulls?state=open&per_page=100")) {
        return createFetchResponse([]);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      issueResolutionPlanResult: createIssueResolutionPlanResult(),
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          return statusResponses.shift() ?? "";
        }

        if (command === "git" && args[0] === "diff" && args[1] === "--name-only") {
          return "packages/cli/src/index.ts\n";
        }

        if (
          command === "git" &&
          args[0] === "diff" &&
          args[1] === "HEAD" &&
          args[2] === "--" &&
          args[3] === "packages/cli/src/index.ts"
        ) {
          return [
            "diff --git a/packages/cli/src/index.ts b/packages/cli/src/index.ts",
            "--- a/packages/cli/src/index.ts",
            "+++ b/packages/cli/src/index.ts",
            "@@ -1,1 +1,1 @@",
            '-const flow = "before";',
            '+const flow = "after";',
          ].join("\n");
        }

        if (
          command === "git" &&
          args[0] === "ls-files" &&
          args[1] === "--others" &&
          args[2] === "--exclude-standard"
        ) {
          return "";
        }

        if (command === "git" && args[0] === "remote") {
          return "git@github.com:DevwareUK/prs.git\n";
        }

        throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
      },
      spawnSyncImpl: (command, args) => {
        if (command === "gh" && args[0] === "--version") {
          return { status: 1, error: new Error("gh is unavailable") };
        }

        if (command === "codex" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "rev-parse") {
          return { status: branches.has(args[2] as string) ? 0 : 1 };
        }

        if (command === "git" && args[0] === "checkout" && args[1] === "main") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "pull") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "checkout" && args[1] === "-b") {
          const branchName = args[2] as string;
          branches.add(branchName);
          activeIssueNumber = Number.parseInt(branchName.match(/issue-(\d+)/)?.[1] ?? "", 10);
          return { status: 0 };
        }

        if (command === "git" && args[0] === "checkout" && typeof args[1] === "string") {
          activeIssueNumber = Number.parseInt(args[1].match(/issue-(\d+)/)?.[1] ?? "", 10);
          return { status: 0 };
        }

        if (command === "codex" && args[0] === "exec") {
          const prompt = String(args.at(-1) ?? "");
          const issueNumber = Number.parseInt(prompt.match(/issue-(\d+)/)?.[1] ?? "", 10);
          codexIssues.push(issueNumber);
          activeIssueNumber = issueNumber;
          const attemptNumber = (codexAttempts.get(issueNumber) ?? 0) + 1;
          codexAttempts.set(issueNumber, attemptNumber);

          if (issueNumber === 124 && attemptNumber === 1) {
            return { status: 1, error: new Error("agent failed") };
          }

          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          return { status: 0, stdout: "built\n", stderr: "" };
        }

        if (command === "git" && (args[0] === "add" || args[0] === "commit" || args[0] === "push")) {
          return { status: 0, stdout: "", stderr: "" };
        }

        if (command === "gh" && args[0] === "pr" && args[1] === "create") {
          return {
            status: 0,
            stdout: `https://github.com/DevwareUK/prs/pull/${activeIssueNumber === 123 ? 701 : 702}\n`,
            stderr: "",
          };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
      spawnImpl: (_command, args, options) => {
        const issueNumber = Number.parseInt(args[2] ?? "", 10);
        codexIssues.push(issueNumber);
        activeIssueNumber = issueNumber;
        const attemptNumber = (codexAttempts.get(issueNumber) ?? 0) + 1;
        codexAttempts.set(issueNumber, attemptNumber);
        writeMockIssueWorktreeOutcome({
          worktreePath: options.cwd ?? REPO_ROOT,
          issueNumber,
          branchName: branchByIssue.get(issueNumber) ?? `feat/issue-${issueNumber}`,
          pullRequest: {
            status: "created",
            title: `Issue ${issueNumber}`,
            url: `https://github.com/DevwareUK/prs/pull/${issueNumber === 123 ? 701 : 702}`,
          },
        });

        if (issueNumber === 124 && attemptNumber === 1) {
          return createMockChildProcess({
            status: 1,
            stderr: "The unattended Codex session did not complete successfully. agent failed\n",
          });
        }

        return createMockChildProcess();
      },
    });

    process.env.OPENAI_API_KEY = "test-key";
    process.env.GITHUB_TOKEN = "test-token";
    process.argv = ["node", "prs", "issue", "batch", "123", "124"];

    await expect(run()).rejects.toThrow("One or more issue runs failed");

    const failedBatchState = readIssueBatchState(issueNumbers);
    cleanupTargets.add(batchStatePath);
    cleanupTargets.add(resolve(REPO_ROOT, failedBatchState.latestRunDir));

    expect(failedBatchState.stoppedIssueNumber).toBe(124);
    expect(failedBatchState.issues).toMatchObject([
      {
        issueNumber: 123,
        status: "completed",
        branchName: branchByIssue.get(123),
        prUrl: "https://github.com/DevwareUK/prs/pull/701",
      },
      {
        issueNumber: 124,
        status: "failed",
        branchName: branchByIssue.get(124),
        error: "The unattended Codex session did not complete successfully. agent failed",
      },
    ]);
    expect(
      readFileSync(resolve(REPO_ROOT, failedBatchState.latestRunDir, "summary.md"), "utf8")
    ).toContain("Stopped at issue: #124");

    process.argv = ["node", "prs", "issue", "batch", "123", "124"];
    await run();

    const completedBatchState = readIssueBatchState(issueNumbers);
    cleanupTargets.add(resolve(REPO_ROOT, completedBatchState.latestRunDir));
    for (const runDir of listRunDirectories().filter((entry) => !beforeRuns.includes(entry))) {
      cleanupTargets.add(resolve(REPO_ROOT, ".prs", "runs", runDir));
    }

    expect(completedBatchState.stoppedIssueNumber).toBeUndefined();
    expect(completedBatchState.issues).toMatchObject([
      {
        issueNumber: 123,
        status: "completed",
        prUrl: "https://github.com/DevwareUK/prs/pull/701",
      },
      {
        issueNumber: 124,
        status: "completed",
        prUrl: "https://github.com/DevwareUK/prs/pull/702",
      },
    ]);
    expect(codexIssues).toEqual([123, 124, 124]);
  });

  it("records no-change multi-issue entries as completed skipped outcomes and continues", async () => {
    const beforeRuns = listRunDirectories();
    createMockCodexHome();
    const issueNumbers = [96, 98, 99];
    const issueTitles = new Map([
      [96, "Batch tracked first issue"],
      [98, "Batch no-change middle issue"],
      [99, "Batch tracked final issue"],
    ]);
    const batchStatePath = resolve(
      REPO_ROOT,
      ".prs",
      "batches",
      `issues-${issueNumbers.join("-")}.json`
    );

    for (const target of [
      resolve(REPO_ROOT, ".prs", "issues", "96"),
      resolve(REPO_ROOT, ".prs", "issues", "98"),
      resolve(REPO_ROOT, ".prs", "issues", "99"),
      resolve(REPO_ROOT, ".prs", "issues", "96-batch-tracked-first-issue"),
      resolve(REPO_ROOT, ".prs", "issues", "98-batch-no-change-middle-issue"),
      resolve(REPO_ROOT, ".prs", "issues", "99-batch-tracked-final-issue"),
      batchStatePath,
    ]) {
      rmSync(target, { recursive: true, force: true });
      cleanupTargets.add(target);
    }

    const statusResponses = [
      "",
      " M packages/cli/src/index.ts\n",
      "",
      "",
      " M packages/cli/src/index.ts\n",
    ];
    const branches = new Set<string>();
    const codexIssues: number[] = [];
    let activeIssueNumber: number | undefined;

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const issueMatch = url.match(/\/issues\/(\d+)$/);
      if (issueMatch) {
        const issueNumber = Number.parseInt(issueMatch[1] ?? "", 10);
        return createFetchResponse({
          title: issueTitles.get(issueNumber),
          body: `Implement issue ${issueNumber} through unattended batch orchestration.`,
          html_url: `https://github.com/DevwareUK/prs/issues/${issueNumber}`,
        });
      }

      if (url.includes("/comments?")) {
        return createFetchResponse([]);
      }

      const planCommentMatch = url.match(/\/issues\/(\d+)\/comments$/);
      if (planCommentMatch && init?.method === "POST") {
        const issueNumber = Number.parseInt(planCommentMatch[1] ?? "", 10);
        return createFetchResponse({
          id: 9000 + issueNumber,
          body: JSON.parse(String(init.body)).body,
          html_url:
            `https://github.com/DevwareUK/prs/issues/${issueNumber}#issuecomment-${9000 + issueNumber}`,
          updated_at: "2026-04-26T13:00:00Z",
        });
      }

      if (url.endsWith("/pulls?state=open&per_page=100")) {
        return createFetchResponse([]);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      issueResolutionPlanResult: createIssueResolutionPlanResult(),
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          return statusResponses.shift() ?? "";
        }

        if (command === "git" && args[0] === "diff" && args[1] === "--name-only") {
          return activeIssueNumber === 98 ? "" : "packages/cli/src/index.ts\n";
        }

        if (
          command === "git" &&
          args[0] === "diff" &&
          args[1] === "HEAD" &&
          args[2] === "--" &&
          args[3] === "packages/cli/src/index.ts"
        ) {
          return [
            "diff --git a/packages/cli/src/index.ts b/packages/cli/src/index.ts",
            "--- a/packages/cli/src/index.ts",
            "+++ b/packages/cli/src/index.ts",
            "@@ -1,1 +1,1 @@",
            `-const issue = "${activeIssueNumber}-before";`,
            `+const issue = "${activeIssueNumber}-after";`,
          ].join("\n");
        }

        if (
          command === "git" &&
          args[0] === "ls-files" &&
          args[1] === "--others" &&
          args[2] === "--exclude-standard"
        ) {
          return "";
        }

        if (command === "git" && args[0] === "remote") {
          return "git@github.com:DevwareUK/prs.git\n";
        }

        throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
      },
      spawnSyncImpl: (command, args) => {
        if (command === "gh" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "gh" && args[0] === "auth" && args[1] === "status") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "rev-parse") {
          return { status: branches.has(args[2] as string) ? 0 : 1 };
        }

        if (command === "git" && args[0] === "checkout" && args[1] === "main") {
          activeIssueNumber = undefined;
          return { status: 0 };
        }

        if (command === "git" && args[0] === "pull") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "checkout" && args[1] === "-b") {
          const branchName = args[2] as string;
          branches.add(branchName);
          activeIssueNumber = Number.parseInt(branchName.match(/issue-(\d+)/)?.[1] ?? "", 10);
          return { status: 0 };
        }

        if (command === "codex" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "codex" && args[0] === "exec") {
          const prompt = String(args.at(-1) ?? "");
          const issueNumber = Number.parseInt(prompt.match(/issue-(\d+)/)?.[1] ?? "", 10);
          codexIssues.push(issueNumber);
          activeIssueNumber = issueNumber;
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          return { status: 0, stdout: "built\n", stderr: "" };
        }

        if (command === "git" && (args[0] === "add" || args[0] === "commit" || args[0] === "push")) {
          return { status: 0, stdout: "", stderr: "" };
        }

        if (command === "gh" && args[0] === "pr" && args[1] === "create") {
          return {
            status: 0,
            stdout: `https://github.com/DevwareUK/prs/pull/${activeIssueNumber === 96 ? 906 : 909}\n`,
            stderr: "",
          };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
      spawnImpl: (_command, args, options) => {
        const issueNumber = Number.parseInt(args[2] ?? "", 10);
        codexIssues.push(issueNumber);
        activeIssueNumber = issueNumber;
        const branchName =
          issueNumber === 96
            ? "feat/issue-96-batch-tracked-first-issue"
            : issueNumber === 98
              ? "feat/issue-98-batch-no-change-middle-issue"
              : "feat/issue-99-batch-tracked-final-issue";
        writeMockIssueWorktreeOutcome({
          worktreePath: options.cwd ?? REPO_ROOT,
          issueNumber,
          branchName,
          pullRequest:
            issueNumber === 98
              ? { status: "skipped", reason: "no-changes" }
              : {
                  status: "created",
                  title: `Issue ${issueNumber}`,
                  url: `https://github.com/DevwareUK/prs/pull/${issueNumber === 96 ? 906 : 909}`,
                },
        });

        return createMockChildProcess();
      },
    });

    process.env.OPENAI_API_KEY = "test-key";
    process.env.GITHUB_TOKEN = "test-token";
    process.argv = ["node", "prs", "issue", "batch", "96", "98", "99"];

    await run();

    const completedBatchState = readIssueBatchState(issueNumbers);
    cleanupTargets.add(batchStatePath);
    cleanupTargets.add(resolve(REPO_ROOT, completedBatchState.latestRunDir));
    for (const runDir of listRunDirectories().filter((entry) => !beforeRuns.includes(entry))) {
      cleanupTargets.add(resolve(REPO_ROOT, ".prs", "runs", runDir));
    }

    expect(codexIssues).toEqual([96, 98, 99]);
    expect(completedBatchState.stoppedIssueNumber).toBeUndefined();
    expect(completedBatchState.issues).toMatchObject([
      {
        issueNumber: 96,
        status: "completed",
        pullRequest: { status: "created" },
      },
      {
        issueNumber: 98,
        status: "completed",
        pullRequest: { status: "skipped", reason: "no-changes" },
      },
      {
        issueNumber: 99,
        status: "completed",
        pullRequest: { status: "created" },
      },
    ]);
    expect(
      readFileSync(resolve(REPO_ROOT, completedBatchState.latestRunDir, "summary.md"), "utf8")
    ).toContain("#98 | completed | branch feat/issue-98-batch-no-change-middle-issue");
    expect(
      readFileSync(resolve(REPO_ROOT, completedBatchState.latestRunDir, "summary.md"), "utf8")
    ).toContain("PR skipped (no-changes)");
  });

  it("records multi-issue child worktree paths for inspection", async () => {
    const issueNumbers = [223, 224];
    const batchStatePath = resolve(
      REPO_ROOT,
      ".prs",
      "batches",
      "issues-223-224.json"
    );

    rmSync(batchStatePath, { recursive: true, force: true });
    cleanupTargets.add(batchStatePath);

    const { run } = await loadCli({
      spawnSyncImpl: (command, args) => {
        if (command === "gh" && args[0] === "--version") {
          return { status: 1, error: new Error("gh is unavailable") };
        }

        if (command === "codex" && args[0] === "--version") {
          return { status: 0 };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
      spawnImpl: (_command, args, options) => {
        const issueNumber = Number.parseInt(args[2] ?? "", 10);
        writeMockIssueWorktreeOutcome({
          worktreePath: options.cwd ?? REPO_ROOT,
          issueNumber,
          branchName: `feat/issue-${issueNumber}-parallel-worktree`,
          pullRequest: {
            status: "created",
            title: `Issue ${issueNumber}`,
            url: `https://github.com/DevwareUK/prs/pull/${issueNumber}`,
          },
        });

        return createMockChildProcess();
      },
    });

    process.env.OPENAI_API_KEY = "test-key";
    process.env.GITHUB_TOKEN = "test-token";
    process.argv = ["node", "prs", "issue", "223", "224"];

    await run();

    const completedBatchState = readIssueBatchState(issueNumbers);
    cleanupTargets.add(resolve(REPO_ROOT, completedBatchState.latestRunDir));

    expect(completedBatchState.issues).toMatchObject([
      {
        issueNumber: 223,
        status: "completed",
        worktreePath: ".prs/worktrees/issues-223-224/issue-223",
      },
      {
        issueNumber: 224,
        status: "completed",
        worktreePath: ".prs/worktrees/issues-223-224/issue-224",
      },
    ]);
  });

});
