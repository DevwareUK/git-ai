import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  REPO_ROOT,
  cleanupTargets,
  buildManagedTestSuggestionBlock,
  createIssueResolutionPlanResult,
  createFetchResponse,
  listRunDirectories,
  withRepositoryConfig,
  loadCli,
} from "./index-test-support";

describe("PR fix workflows", () => {
  it("runs pr fix-comments, writes run artifacts, verifies the build, and commits the result", async () => {
    const beforeRuns = listRunDirectories();
    let gitStatusCallCount = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 88,
          title: "Tighten PR review comment fixing flow",
          body: "Apply selected review feedback with Codex and keep the workflow auditable.",
          html_url: "https://github.com/DevwareUK/prs/pull/88",
          base: { ref: "main" },
          head: { ref: "feat/pr-fix-comments" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 501,
            body: "Guard against an empty comment selection before starting Codex.",
            path: "packages/cli/src/index.ts",
            line: 1900,
            side: "RIGHT",
            diff_hunk: "@@ -1890,0 +1900,4 @@",
            html_url:
              "https://github.com/DevwareUK/prs/pull/88#discussion_r501",
            user: { login: "reviewer-a" },
            created_at: "2026-03-18T08:00:00Z",
            updated_at: "2026-03-18T08:05:00Z",
          },
          {
            id: 502,
            body: "Thanks!",
            path: "packages/cli/src/index.ts",
            line: 1904,
            side: "RIGHT",
            html_url:
              "https://github.com/DevwareUK/prs/pull/88#discussion_r502",
            user: { login: "reviewer-b" },
            created_at: "2026-03-18T08:06:00Z",
            updated_at: "2026-03-18T08:06:00Z",
          },
        ])
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 801,
          body: "updated",
          html_url: "https://github.com/DevwareUK/prs/issues/91#issuecomment-801",
          created_at: "2026-03-19T10:00:00Z",
          updated_at: "2026-03-19T10:10:00Z",
          user: { login: "github-actions[bot]", type: "Bot" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run, spawnSync } = await loadCli({
      readlineAnswers: ["all", "y"],
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          gitStatusCallCount += 1;
          return gitStatusCallCount === 1 ? "" : " M packages/cli/src/index.ts\n";
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

        if (command === "codex") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          return { status: 0, stdout: "built\n", stderr: "" };
        }

        if (command === "git" && args[0] === "add") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "commit") {
          return { status: 0 };
        }

        if (
          command === "git" &&
          args[0] === "fetch" &&
          args[1] === "origin" &&
          args[2] === "feat/pr-fix-comments"
        ) {
          return { status: 0, stdout: "", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-parse" &&
          args[1] === "origin/feat/pr-fix-comments"
        ) {
          return { status: 0, stdout: "head-tip-88\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-list" &&
          args[1] === "--left-right" &&
          args[2] === "--count" &&
          args[3] === "origin/feat/pr-fix-comments...HEAD"
        ) {
          return { status: 0, stdout: "0 1\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "push" &&
          args[1] === "origin" &&
          args[2] === "HEAD:feat/pr-fix-comments"
        ) {
          return { status: 0, stdout: "pushed\n", stderr: "" };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-comments", "88"];

    await run();

    const createdRun = listRunDirectories().find((entry) => !beforeRuns.includes(entry));
    expect(createdRun).toBeDefined();

    const runDirPath = resolve(REPO_ROOT, ".prs", "runs", createdRun as string);
    const snapshotFilePath = resolve(runDirPath, "pr-review-comments.md");
    const promptFilePath = resolve(runDirPath, "prompt.md");
    const metadataFilePath = resolve(runDirPath, "metadata.json");
    const outputLogPath = resolve(runDirPath, "output.log");
    cleanupTargets.add(runDirPath);

    expect(readFileSync(snapshotFilePath, "utf8")).toContain("# Pull Request Review Fix Snapshot");
    expect(readFileSync(snapshotFilePath, "utf8")).toContain("Guard against an empty comment selection");
    expect(readFileSync(snapshotFilePath, "utf8")).not.toContain("Thanks!");
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "Read the pull request review fix snapshot"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain("keep code changes focused");
    expect(readFileSync(promptFilePath, "utf8")).toContain("✅ Implementation complete");
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "continue by giving further instruction or type `/exit`"
    );
    expect(readFileSync(promptFilePath, "utf8")).not.toContain("[2] Commit changes");
    expect(readFileSync(promptFilePath, "utf8")).not.toContain("/commit");
    expect(readFileSync(outputLogPath, "utf8")).toContain("# prs pr fix-comments run log");
    expect(readFileSync(outputLogPath, "utf8")).toContain(
      "$ git fetch origin feat/pr-fix-comments"
    );
    expect(readFileSync(outputLogPath, "utf8")).toContain(
      "$ git push origin HEAD:feat/pr-fix-comments"
    );
    expect(JSON.parse(readFileSync(metadataFilePath, "utf8"))).toMatchObject({
      prNumber: 88,
      prTitle: "Tighten PR review comment fixing flow",
      baseRefName: "main",
      headRefName: "feat/pr-fix-comments",
      selectedComments: [
        {
          id: 501,
          path: "packages/cli/src/index.ts",
          line: 1900,
          url: "https://github.com/DevwareUK/prs/pull/88#discussion_r501",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["commit", "-F", expect.stringContaining("commit-message.txt")],
      expect.any(Object)
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/pr-fix-comments"],
      expect.any(Object)
    );
  });

  it("groups nearby PR review threads, keeps reply context, and snapshots linked issue details", async () => {
    const beforeRuns = listRunDirectories();
    let gitStatusCallCount = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 66,
          title: "Improve fix-comments task handoff",
          body: "Closes #42\n\nImprove the prompt quality for Codex handoff.",
          html_url: "https://github.com/DevwareUK/prs/pull/66",
          base: { ref: "main" },
          head: { ref: "feat/fix-comment-task-handoff" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          title: "Improve PR comment selection and context quality",
          body: "Make the review-fix snapshot more coherent for Codex.",
          html_url: "https://github.com/DevwareUK/prs/issues/42",
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 701,
            body: "Group nearby review comments into one selectable task.",
            path: "packages/cli/src/index.ts",
            line: 1200,
            side: "RIGHT",
            diff_hunk: "@@ -1196,0 +1200,4 @@",
            html_url:
              "https://github.com/DevwareUK/prs/pull/66#discussion_r701",
            user: { login: "reviewer-a" },
            created_at: "2026-03-18T08:00:00Z",
            updated_at: "2026-03-18T08:05:00Z",
          },
          {
            id: 702,
            body: "The replies here explain that `all` should still mean every individual thread.",
            path: "packages/cli/src/index.ts",
            line: 1200,
            side: "RIGHT",
            diff_hunk: "@@ -1196,0 +1200,4 @@",
            html_url:
              "https://github.com/DevwareUK/prs/pull/66#discussion_r702",
            user: { login: "reviewer-b" },
            created_at: "2026-03-18T08:06:00Z",
            updated_at: "2026-03-18T08:08:00Z",
            in_reply_to_id: 701,
          },
          {
            id: 703,
            body: "Include the local file excerpt in the Codex snapshot for nearby comments.",
            path: "packages/cli/src/index.ts",
            line: 1208,
            side: "RIGHT",
            diff_hunk: "@@ -1204,0 +1208,4 @@",
            html_url:
              "https://github.com/DevwareUK/prs/pull/66#discussion_r703",
            user: { login: "reviewer-c" },
            created_at: "2026-03-18T08:09:00Z",
            updated_at: "2026-03-18T08:10:00Z",
          },
        ])
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 801,
          body: "updated",
          html_url: "https://github.com/DevwareUK/prs/issues/91#issuecomment-801",
          created_at: "2026-03-19T10:00:00Z",
          updated_at: "2026-03-19T10:10:00Z",
          user: { login: "github-actions[bot]", type: "Bot" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      readlineAnswers: ["g1", "n"],
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          gitStatusCallCount += 1;
          return gitStatusCallCount === 1 ? "" : " M packages/cli/src/index.ts\n";
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

        if (command === "codex") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          return { status: 0, stdout: "built\n", stderr: "" };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-comments", "66"];

    await run();

    const createdRun = listRunDirectories().find((entry) => !beforeRuns.includes(entry));
    expect(createdRun).toBeDefined();

    const runDirPath = resolve(REPO_ROOT, ".prs", "runs", createdRun as string);
    const snapshotFilePath = resolve(runDirPath, "pr-review-comments.md");
    const metadataFilePath = resolve(runDirPath, "metadata.json");
    cleanupTargets.add(runDirPath);

    const snapshot = readFileSync(snapshotFilePath, "utf8");
    expect(snapshot).toContain("## Linked issues");
    expect(snapshot).toContain("Issue #42: Improve PR comment selection and context quality");
    expect(snapshot).toContain("### Task 1");
    expect(snapshot).toContain("Selection type: Grouped review task");
    expect(snapshot).toContain("reviewer-b (2026-03-18T08:08:00Z)");
    expect(snapshot).toContain("##### Local file excerpt");

    expect(JSON.parse(readFileSync(metadataFilePath, "utf8"))).toMatchObject({
      prNumber: 66,
      linkedIssues: [
        {
          number: 42,
          title: "Improve PR comment selection and context quality",
          url: "https://github.com/DevwareUK/prs/issues/42",
        },
      ],
      selectedTasks: [
        {
          kind: "group",
          path: "packages/cli/src/index.ts",
          commentIds: [701, 702, 703],
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("runs pr fix-tests, writes run artifacts, verifies the build, and commits the result", async () => {
    const beforeRuns = listRunDirectories();
    let gitStatusCallCount = 0;
    process.env.GH_TOKEN = "";
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 91,
          title: "Close the AI test suggestions implementation loop",
          body: "Apply selected AI-generated test suggestions with Codex.",
          html_url: "https://github.com/DevwareUK/prs/pull/91",
          base: { ref: "main" },
          head: { ref: "feat/pr-fix-tests" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 801,
            body: [
              "<!-- prs:test-suggestions -->",
              "## AI Test Suggestions",
              "",
              "### Overview",
              "The PR changes the CLI flow and needs focused integration coverage.",
              "",
              "### Suggested test areas",
              "",
              ...buildManagedTestSuggestionBlock({
                title: "Verify prompt generation for selected test suggestions",
                priority: "High",
                addressed: false,
                value:
                  "The Codex handoff should preserve the selected test context.",
                protectedPaths: [
                  "packages/cli/src/workflows/pr-fix-tests/workspace.ts",
                ],
                likelyLocations: [
                  "packages/cli/src/index.test.ts",
                  "packages/cli/src/workflows/pr-fix-tests/workspace.ts",
                ],
                implementationNote:
                  "Add a CLI integration test that selects this suggestion and asserts the generated run artifacts keep the richer fields.",
              }),
              "",
              ...buildManagedTestSuggestionBlock({
                title: "Verify managed comment parsing failure cases",
                priority: "Medium",
                addressed: false,
                value:
                  "The command should fail clearly when the managed comment is malformed.",
                likelyLocations: ["packages/cli/src/index.test.ts"],
                edgeCases: [
                  "A required task field is missing from one suggestion block.",
                ],
                implementationNote:
                  "Keep the malformed-comment CLI test focused on the exact parser error surfaced to the user.",
              }),
              "",
              "### Edge cases",
              "- The marker exists but the suggested test areas section is missing.",
              "",
              "### Likely places to add tests",
              "- `packages/cli/src/index.test.ts`",
            ].join("\n"),
            html_url: "https://github.com/DevwareUK/prs/issues/91#issuecomment-801",
            updated_at: "2026-03-19T10:00:00Z",
            user: { login: "github-actions[bot]", type: "Bot" },
          },
        ])
      );
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        id: 801,
        body: "updated",
        html_url: "https://github.com/DevwareUK/prs/issues/91#issuecomment-801",
        created_at: "2026-03-19T10:00:00Z",
        updated_at: "2026-03-19T10:10:00Z",
        user: { login: "github-actions[bot]", type: "Bot" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { run, spawnSync } = await loadCli({
      readlineAnswers: ["2", "y"],
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          gitStatusCallCount += 1;
          return gitStatusCallCount === 1 ? "" : " M packages/cli/src/index.test.ts\n";
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

        if (command === "codex") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          return { status: 0, stdout: "built\n", stderr: "" };
        }

        if (command === "git" && args[0] === "add") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "commit") {
          return { status: 0 };
        }

        if (
          command === "git" &&
          args[0] === "fetch" &&
          args[1] === "origin" &&
          args[2] === "feat/pr-fix-tests"
        ) {
          return { status: 0, stdout: "", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-parse" &&
          args[1] === "HEAD"
        ) {
          return { status: 0, stdout: "fixed-tests-head-sha\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-parse" &&
          args[1] === "origin/feat/pr-fix-tests"
        ) {
          return { status: 0, stdout: "head-tip-91\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-list" &&
          args[1] === "--left-right" &&
          args[2] === "--count" &&
          args[3] === "origin/feat/pr-fix-tests...HEAD"
        ) {
          return { status: 0, stdout: "0 1\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "push" &&
          args[1] === "origin" &&
          args[2] === "HEAD:feat/pr-fix-tests"
        ) {
          return { status: 0, stdout: "pushed\n", stderr: "" };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-tests", "91"];

    await run();

    const createdRun = listRunDirectories().find((entry) => !beforeRuns.includes(entry));
    expect(createdRun).toBeDefined();

    const runDirPath = resolve(REPO_ROOT, ".prs", "runs", createdRun as string);
    const snapshotFilePath = resolve(runDirPath, "pr-test-suggestions.md");
    const promptFilePath = resolve(runDirPath, "prompt.md");
    const metadataFilePath = resolve(runDirPath, "metadata.json");
    const outputLogPath = resolve(runDirPath, "output.log");
    cleanupTargets.add(runDirPath);

    expect(readFileSync(snapshotFilePath, "utf8")).toContain(
      "# Pull Request Test Suggestions Fix Snapshot"
    );
    expect(readFileSync(snapshotFilePath, "utf8")).toContain(
      "Suggestion 1: Verify managed comment parsing failure cases"
    );
    expect(readFileSync(snapshotFilePath, "utf8")).toContain("- Test type: integration");
    expect(readFileSync(snapshotFilePath, "utf8")).toContain(
      "- Implementation note: Keep the malformed-comment CLI test focused on the exact parser error surfaced to the user."
    );
    expect(readFileSync(snapshotFilePath, "utf8")).not.toContain(
      "Verify prompt generation for selected test suggestions"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "Read the pull request test suggestions fix snapshot"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "implementing automated tests for the selected areas"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain("✅ Implementation complete");
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "continue by giving further instruction or type `/exit`"
    );
    expect(readFileSync(promptFilePath, "utf8")).not.toContain("[2] Commit changes");
    expect(readFileSync(promptFilePath, "utf8")).not.toContain("/commit");
    expect(readFileSync(outputLogPath, "utf8")).toContain("# prs pr fix-tests run log");
    expect(readFileSync(outputLogPath, "utf8")).toContain(
      "$ git fetch origin feat/pr-fix-tests"
    );
    expect(readFileSync(outputLogPath, "utf8")).toContain(
      "$ git push origin HEAD:feat/pr-fix-tests"
    );
    expect(JSON.parse(readFileSync(metadataFilePath, "utf8"))).toMatchObject({
      prNumber: 91,
      prTitle: "Close the AI test suggestions implementation loop",
      sourceComment: {
        id: 801,
        url: "https://github.com/DevwareUK/prs/issues/91#issuecomment-801",
      },
      selectedSuggestions: [
        {
          area: "Verify managed comment parsing failure cases",
          priority: "medium",
          testType: "integration",
          behavior:
            "Verify managed comment parsing failure cases should stay covered.",
          regressionRisk:
            "Verify managed comment parsing failure cases can regress without focused tests.",
          likelyLocations: ["packages/cli/src/index.test.ts"],
          edgeCases: ["A required task field is missing from one suggestion block."],
          implementationNote:
            "Keep the malformed-comment CLI test focused on the exact parser error surfaced to the user.",
        },
      ],
      edgeCases: ["The marker exists but the suggested test areas section is missing."],
      likelyLocations: ["packages/cli/src/index.test.ts"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/DevwareUK/prs/issues/comments/801",
      expect.objectContaining({
        method: "PATCH",
        body: expect.not.stringContaining("fixed-tests-head-sha"),
      })
    );
    const updatedCommentBody = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body)
    ).body as string;
    expect(updatedCommentBody).toContain(
      "#### Verify prompt generation for selected test suggestions\n- [ ] Addressed"
    );
    expect(updatedCommentBody).toContain(
      "#### Verify managed comment parsing failure cases\n- [x] Addressed"
    );
    expect(updatedCommentBody).not.toContain("<!-- prs:test-suggestions:resolved-start -->");
    expect(updatedCommentBody).not.toContain("<!-- prs:test-suggestions:resolved-end -->");
    expect(updatedCommentBody).not.toContain("fixed-tests-head-sha");
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["commit", "-F", expect.stringContaining("commit-message.txt")],
      expect.any(Object)
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/pr-fix-tests"],
      expect.any(Object)
    );
  });

  it("runs pr fix-failing-tests, captures failing output, verifies the fix, and commits the result", async () => {
    const beforeRuns = listRunDirectories();
    let buildCallCount = 0;
    let gitStatusCallCount = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 95,
          title: "Repair failing PR verification",
          body: "Closes #42\n\nThe local verification command is currently failing.",
          html_url: "https://github.com/DevwareUK/prs/pull/95",
          base: { ref: "main" },
          head: { ref: "feat/pr-failing-tests" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          title: "Fix failing CLI verification",
          body: "The PR should pass the configured local build before merge.",
          html_url: "https://github.com/DevwareUK/prs/issues/42",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run, spawnSync } = await loadCli({
      readlineAnswers: ["y"],
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
          gitStatusCallCount += 1;
          return gitStatusCallCount === 1 ? "" : " M packages/cli/src/index.ts\n";
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

        if (command === "codex") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          buildCallCount += 1;
          return buildCallCount === 1
            ? {
                status: 1,
                stdout: "FAIL packages/cli/src/index.test.ts\n",
                stderr: "expected true to be false\n",
              }
            : { status: 0, stdout: "built\n", stderr: "" };
        }

        if (command === "git" && args[0] === "add") {
          return { status: 0 };
        }

        if (command === "git" && args[0] === "commit") {
          return { status: 0 };
        }

        if (
          command === "git" &&
          args[0] === "fetch" &&
          args[1] === "origin" &&
          args[2] === "feat/pr-failing-tests"
        ) {
          return { status: 0, stdout: "", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-parse" &&
          args[1] === "origin/feat/pr-failing-tests"
        ) {
          return { status: 0, stdout: "head-tip-95\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "rev-list" &&
          args[1] === "--left-right" &&
          args[2] === "--count" &&
          args[3] === "origin/feat/pr-failing-tests...HEAD"
        ) {
          return { status: 0, stdout: "0 1\n", stderr: "" };
        }

        if (
          command === "git" &&
          args[0] === "push" &&
          args[1] === "origin" &&
          args[2] === "HEAD:feat/pr-failing-tests"
        ) {
          return { status: 0, stdout: "pushed\n", stderr: "" };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-failing-tests", "95"];

    await run();

    const createdRun = listRunDirectories().find((entry) => !beforeRuns.includes(entry));
    expect(createdRun).toBeDefined();

    const runDirPath = resolve(REPO_ROOT, ".prs", "runs", createdRun as string);
    const snapshotFilePath = resolve(runDirPath, "failing-tests.md");
    const promptFilePath = resolve(runDirPath, "prompt.md");
    const metadataFilePath = resolve(runDirPath, "metadata.json");
    const outputLogPath = resolve(runDirPath, "output.log");
    cleanupTargets.add(runDirPath);

    expect(readFileSync(snapshotFilePath, "utf8")).toContain(
      "# Pull Request Failing Tests Snapshot"
    );
    expect(readFileSync(snapshotFilePath, "utf8")).toContain("pnpm build");
    expect(readFileSync(snapshotFilePath, "utf8")).toContain(
      "FAIL packages/cli/src/index.test.ts"
    );
    expect(readFileSync(snapshotFilePath, "utf8")).toContain(
      "Issue #42: Fix failing CLI verification"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "Read the pull request failing tests snapshot"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain(
      "keep code changes focused on fixing the captured failing tests"
    );
    expect(readFileSync(promptFilePath, "utf8")).toContain("✅ Implementation complete");
    expect(readFileSync(outputLogPath, "utf8")).toContain(
      "# prs pr fix-failing-tests run log"
    );
    expect(readFileSync(outputLogPath, "utf8")).toContain("$ pnpm build");
    expect(readFileSync(outputLogPath, "utf8")).toContain(
      "FAIL packages/cli/src/index.test.ts"
    );
    expect(readFileSync(outputLogPath, "utf8")).toContain("built");
    expect(JSON.parse(readFileSync(metadataFilePath, "utf8"))).toMatchObject({
      prNumber: 95,
      prTitle: "Repair failing PR verification",
      prUrl: "https://github.com/DevwareUK/prs/pull/95",
      baseRefName: "main",
      headRefName: "feat/pr-failing-tests",
      linkedIssues: [
        {
          number: 42,
          title: "Fix failing CLI verification",
          url: "https://github.com/DevwareUK/prs/issues/42",
        },
      ],
      verificationCommand: ["pnpm", "build"],
      initialVerification: {
        status: 1,
        error: null,
        stdout: "FAIL packages/cli/src/index.test.ts\n",
        stderr: "expected true to be false\n",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(buildCallCount).toBe(2);
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["commit", "-F", expect.stringContaining("commit-message.txt")],
      expect.any(Object)
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feat/pr-failing-tests"],
      expect.any(Object)
    );
  });

  it("fails pr fix-failing-tests clearly when repository forge support is disabled", async () => {
    await withRepositoryConfig(
      JSON.stringify(
        {
          forge: {
            type: "none",
          },
        },
        null,
        2
      ),
      async () => {
        const { run } = await loadCli();

        process.argv = ["node", "prs", "pr", "fix-failing-tests", "98"];

        await expect(run()).rejects.toThrow(
          "Repository forge support is disabled by .prs/config.json. Configure `forge.type` to enable pull request workflows."
        );
      }
    );
  });

  it("exits pr fix-failing-tests without runtime work when verification already passes", async () => {
    const beforeRuns = listRunDirectories();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createFetchResponse({
        number: 96,
        title: "Already passing PR verification",
        body: "",
        html_url: "https://github.com/DevwareUK/prs/pull/96",
        base: { ref: "main" },
        head: { ref: "feat/already-passing" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { run, spawnSync } = await loadCli({
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
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

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          return { status: 0, stdout: "built\n", stderr: "" };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-failing-tests", "96"];
    const messages: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      messages.push(String(message ?? ""));
    });

    await run();

    expect(listRunDirectories()).toEqual(beforeRuns);
    expect(messages.join("\n")).toContain(
      "Configured verification command passed. No failing test output was captured."
    );
    expect(spawnSync).not.toHaveBeenCalledWith(
      "codex",
      expect.any(Array),
      expect.any(Object)
    );
    expect(
      spawnSync.mock.calls.some(
        ([command, args]) =>
          command === "git" &&
          Array.isArray(args) &&
          (args[0] === "commit" || args[0] === "push")
      )
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops pr fix-failing-tests before commit when final verification still fails", async () => {
    const beforeRuns = listRunDirectories();
    let buildCallCount = 0;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createFetchResponse({
        number: 97,
        title: "Still failing PR verification",
        body: "",
        html_url: "https://github.com/DevwareUK/prs/pull/97",
        base: { ref: "main" },
        head: { ref: "feat/still-failing" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { run, spawnSync } = await loadCli({
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
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

        if (command === "codex") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        if (command === "pnpm" && args[0] === "build") {
          buildCallCount += 1;
          return buildCallCount === 1
            ? { status: 1, stdout: "FAIL before runtime\n", stderr: "before\n" }
            : { status: 1, stdout: "FAIL after runtime\n", stderr: "after\n" };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-failing-tests", "97"];

    await expect(run()).rejects.toThrow("Build failed. Changes were not committed.");

    const createdRun = listRunDirectories().find((entry) => !beforeRuns.includes(entry));
    expect(createdRun).toBeDefined();
    const runDirPath = resolve(REPO_ROOT, ".prs", "runs", createdRun as string);
    cleanupTargets.add(runDirPath);
    expect(readFileSync(resolve(runDirPath, "output.log"), "utf8")).toContain(
      "FAIL after runtime"
    );
    expect(buildCallCount).toBe(2);
    expect(
      spawnSync.mock.calls.some(
        ([command, args]) =>
          command === "git" &&
          Array.isArray(args) &&
          (args[0] === "commit" || args[0] === "push")
      )
    ).toBe(false);
  });

  it("exits pr fix-tests cleanly when no test suggestions are selected", async () => {
    const beforeRuns = listRunDirectories();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 94,
          title: "Allow skipping selected AI test suggestions",
          body: "",
          html_url: "https://github.com/DevwareUK/prs/pull/94",
          base: { ref: "main" },
          head: { ref: "feat/skip-test-suggestions" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 804,
            body: [
              "<!-- prs:test-suggestions -->",
              "## AI Test Suggestions",
              "",
              "### Suggested test areas",
              "",
              ...buildManagedTestSuggestionBlock({
                title: "Verify selection can exit without changes",
                priority: "Medium",
                value: "Users should be able to back out cleanly.",
              }),
            ].join("\n"),
            html_url: "https://github.com/DevwareUK/prs/issues/94#issuecomment-804",
            updated_at: "2026-03-19T11:30:00Z",
            user: { login: "github-actions[bot]", type: "Bot" },
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run, spawnSync } = await loadCli({
      readlineAnswers: ["none"],
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
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

        if (command === "pnpm" && args[0] === "--version") {
          return { status: 0 };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-tests", "94"];

    await run();

    expect(listRunDirectories()).toEqual(beforeRuns);
    expect(spawnSync).not.toHaveBeenCalledWith(
      "codex",
      expect.any(Array),
      expect.any(Object)
    );
    expect(spawnSync).not.toHaveBeenCalledWith(
      "pnpm",
      ["build"],
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails pr fix-tests clearly when no managed AI test suggestions comment exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 92,
          title: "No managed AI test suggestions comment",
          body: "",
          html_url: "https://github.com/DevwareUK/prs/pull/92",
          base: { ref: "main" },
          head: { ref: "feat/no-managed-test-comment" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 802,
            body: "Human discussion without the managed marker.",
            html_url: "https://github.com/DevwareUK/prs/issues/92#issuecomment-802",
            updated_at: "2026-03-19T10:30:00Z",
            user: { login: "reviewer-a", type: "User" },
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      issueResolutionPlanResult: createIssueResolutionPlanResult(),
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
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
          return { status: 1, error: new Error("codex is unavailable") };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-tests", "92"];

    await expect(run()).rejects.toThrow(
      "No managed AI test suggestions comment was found for PR #92."
    );
  });

  it("fails pr fix-tests clearly when the managed AI test suggestions comment cannot be parsed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 93,
          title: "Malformed managed AI test suggestions comment",
          body: "",
          html_url: "https://github.com/DevwareUK/prs/pull/93",
          base: { ref: "main" },
          head: { ref: "feat/malformed-managed-test-comment" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 803,
            body: [
              "<!-- prs:test-suggestions -->",
              "## AI Test Suggestions",
              "",
              "### Suggested test areas",
              "",
              "#### Missing Why Field",
              "- Priority: High",
              "- Test type: integration",
              "- Behavior covered: Missing Why Field should still be parsed until the required field check fails.",
              "- Regression risk: The parser should surface which required field is absent.",
            ].join("\n"),
            html_url: "https://github.com/DevwareUK/prs/issues/93#issuecomment-803",
            updated_at: "2026-03-19T11:00:00Z",
            user: { login: "github-actions[bot]", type: "Bot" },
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      issueResolutionPlanResult: createIssueResolutionPlanResult(),
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
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
          return { status: 1, error: new Error("codex is unavailable") };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-tests", "93"];

    await expect(run()).rejects.toThrow(
      'Failed to parse the managed AI test suggestions comment for PR #93. Suggestion "Missing Why Field" is missing a Why it matters field.'
    );
  });

  it("fails pr fix-comments clearly when no actionable review comments remain after filtering", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          number: 89,
          title: "No actionable review comments",
          body: "",
          html_url: "https://github.com/DevwareUK/prs/pull/89",
          base: { ref: "main" },
          head: { ref: "feat/no-actionable-comments" },
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse([
          {
            id: 601,
            body: "Thanks!",
            path: "packages/cli/src/index.ts",
            line: 10,
            side: "RIGHT",
            html_url:
              "https://github.com/DevwareUK/prs/pull/89#discussion_r601",
            user: { login: "reviewer-a" },
            created_at: "2026-03-18T09:00:00Z",
            updated_at: "2026-03-18T09:01:00Z",
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const { run } = await loadCli({
      issueResolutionPlanResult: createIssueResolutionPlanResult(),
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "status") {
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
          return { status: 1, error: new Error("codex is unavailable") };
        }

        throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
      },
    });

    process.argv = ["node", "prs", "pr", "fix-comments", "89"];

    await expect(run()).rejects.toThrow(
      "No actionable pull request review comments were found for PR #89."
    );
  });

});
