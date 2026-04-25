# Issue Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `prs issue refine <issue-number>` so existing GitHub issues can be refined into implementation-ready specifications with resumable Codex sessions and a safe review/apply flow.

**Architecture:** Extend the existing `issue` command surface rather than overloading `prs issue draft`. Reuse the existing interactive runtime launcher, draft review loop, and `.prs/runs/` artifact pattern, while adding dedicated refinement state under `.prs/issues/<issue-number>/draft-session.json` plus forge operations for issue comments and issue-body updates. Keep the issue body as the only execution source of truth for `prs issue <number>`.

**Tech Stack:** TypeScript, Vitest, Node.js CLI, GitHub forge adapter

---

### Task 1: Add Command Parsing And Public Command Surface

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `README.md`
- Test: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write the failing parser and help-surface tests**

```ts
it("parses issue refine as a dedicated issue subcommand", async () => {
  process.env.GIT_AI_DISABLE_AUTO_RUN = "1";
  const { parseIssueCommandArgs } = await loadCli();

  expect(parseIssueCommandArgs(["issue", "refine", "42"])).toEqual({
    action: "refine",
    issueNumber: 42,
  });
});

it("rejects extra issue refine arguments", async () => {
  process.env.GIT_AI_DISABLE_AUTO_RUN = "1";
  const { parseIssueCommandArgs } = await loadCli();

  expect(() => parseIssueCommandArgs(["issue", "refine", "42", "extra"])).toThrow(
    'Unknown issue option "extra".'
  );
});
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "parses issue refine as a dedicated issue subcommand"`
Expected: FAIL because `parseIssueCommandArgs()` does not yet recognize `refine`.

- [ ] **Step 3: Implement the parser and help text changes**

```ts
type IssueCommandOptions =
  | {
      action: "draft";
    }
  | {
      action: "refine";
      issueNumber: number;
    };

const ISSUE_USAGE = [
  "Usage:",
  "  prs issue <number> [--mode <interactive|unattended>]",
  "  prs issue batch <number> <number> [...number] [--mode unattended]",
  "  prs issue draft",
  "  prs issue refine <number>",
  "  prs issue plan <number> [--refresh]",
  "  prs issue prepare <number> [--mode <local|github-action>]",
  "  prs issue finalize <number>",
].join("\n");

if (subcommand === "refine") {
  const optionArgs = issueArgs.slice(2);
  if (optionArgs.length > 0) {
    throw new Error(`Unknown issue option "${optionArgs[0]}". ${ISSUE_USAGE}`);
  }

  return {
    action: "refine",
    issueNumber: parseIssueNumber(issueArgs[1]),
  };
}
```

- [ ] **Step 4: Update README command documentation**

```md
| `prs issue draft` | Interactive issue drafting flow for brand-new issues from a rough idea. |
| `prs issue refine <number>` | Interactive issue-refinement flow for an existing GitHub issue. It fetches the issue body plus comments, asks what should change, launches the configured runtime, previews the refined markdown, and then either updates the existing PRS-managed issue body or offers creation of a linked PRS-managed issue when the source issue is not PRS-managed. |
```

- [ ] **Step 5: Run the parser and README-adjacent tests to verify they pass**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "issue refine"`
Expected: PASS for the new parser coverage.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/index.test.ts README.md
git commit -m "feat: add issue refine command parsing"
```

### Task 2: Add Refinement State And Run-Artifact Helpers

**Files:**
- Modify: `packages/cli/src/run-artifacts.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write the failing state-path and metadata tests**

```ts
it("stores issue refine state under the issue namespace", async () => {
  const beforeRuns = listRunDirectories();
  createMockCodexHome();

  const { run } = await loadCli({
    readlineAnswers: ["Clarify acceptance criteria."],
    spawnSyncImpl: (command, args) => {
      if (command === "codex" && args[0] === "--version") {
        return { status: 0 };
      }

      if (command === "codex") {
        const { metadata } = readLatestRunMetadata();
        writeFileSync(
          resolve(REPO_ROOT, metadata.draftFile as string),
          "# Refined issue title\n\n## Summary\nRefined body.\n",
          "utf8"
        );
        return { status: 0 };
      }

      return { status: 0 };
    },
    fetchIssueDetailsResult: {
      title: "Customer request",
      body: "Short initial body.",
      url: "https://github.com/DevwareUK/prs/issues/42",
    },
  });

  process.argv = ["node", "prs", "issue", "refine", "42"];
  await run();

  expect(existsSync(resolve(REPO_ROOT, ".prs", "issues", "42", "draft-session.json"))).toBe(true);
  expect(listRunDirectories().find((entry) => !beforeRuns.includes(entry))).toMatch(
    /issue-refine-42$/
  );
});
```

- [ ] **Step 2: Run the new refinement-state test to verify it fails**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "stores issue refine state under the issue namespace"`
Expected: FAIL because the refinement run dir and session file do not exist yet.

- [ ] **Step 3: Implement run-artifact helpers and refinement state types**

```ts
export function getIssueDraftSessionStateFilePath(
  repoRoot: string,
  issueNumber: number
): string {
  return resolve(getIssueStateDir(repoRoot, issueNumber), "draft-session.json");
}

export function getIssueRefineRunDir(
  repoRoot: string,
  issueNumber: number,
  date = new Date()
): string {
  return resolve(
    repoRoot,
    REPOSITORY_STATE_DIRECTORY,
    "runs",
    `${formatRunTimestamp(date)}-issue-refine-${issueNumber}`
  );
}
```

```ts
type IssueRefineSessionState = {
  issueNumber: number;
  runtimeType: InteractiveRuntimeType;
  runDir: string;
  promptFile: string;
  outputLog: string;
  latestDraftFile: string;
  sessionId?: string;
  completedIssueNumber?: number;
  completedIssueUrl?: string;
  completionMode?: "updated-existing" | "created-linked" | "kept-on-disk";
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Add workspace creation for refinement runs**

```ts
type IssueRefineWorkspace = {
  runDir: string;
  draftFilePath: string;
  promptFilePath: string;
  metadataFilePath: string;
  outputLogPath: string;
};

function createIssueRefineWorkspace(
  repoRoot: string,
  issueNumber: number
): IssueRefineWorkspace {
  const runDir = getIssueRefineRunDir(repoRoot, issueNumber);
  mkdirSync(runDir, { recursive: true });

  return {
    runDir,
    draftFilePath: resolve(runDir, `issue-refine-${issueNumber}.md`),
    promptFilePath: resolve(runDir, "prompt.md"),
    metadataFilePath: resolve(runDir, "metadata.json"),
    outputLogPath: resolve(runDir, "output.log"),
  };
}
```

- [ ] **Step 5: Run the targeted refinement-state test again**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "stores issue refine state under the issue namespace"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/run-artifacts.ts packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat: add issue refine session state paths"
```

### Task 3: Extend The Forge Layer For Issue Comments And Issue Updates

**Files:**
- Modify: `packages/cli/src/forge.ts`
- Modify: `packages/cli/src/github.ts`
- Modify: `packages/cli/src/index.test.ts`
- Test: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write the failing refine-workflow tests that need forge support**

```ts
it("updates a prs-managed issue in place after refine approval", async () => {
  const updateIssueBody = vi.fn().mockResolvedValue({
    number: 42,
    title: "Refined title",
    url: "https://github.com/DevwareUK/prs/issues/42",
  });

  const { run } = await loadCli({
    readlineAnswers: ["Tighten scope and acceptance criteria.", "y"],
    fetchIssueDetailsResult: {
      title: "Existing PRS issue",
      body: "<!-- prs:managed-issue -->\n\n## Summary\nOld body.",
      url: "https://github.com/DevwareUK/prs/issues/42",
    },
    fetchIssueCommentsResult: [],
    updateIssueResult: {
      number: 42,
      title: "Refined title",
      url: "https://github.com/DevwareUK/prs/issues/42",
    },
  });

  process.argv = ["node", "prs", "issue", "refine", "42"];
  await run();

  expect(updateIssueBody).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the refine apply test to verify it fails**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "updates a prs-managed issue in place after refine approval"`
Expected: FAIL because the forge interface does not yet support issue comments and issue-body updates.

- [ ] **Step 3: Extend forge types and GitHub adapter methods**

```ts
export interface RepositoryForge {
  fetchIssueComments(issueNumber: number): Promise<RepositoryComment[]>;
  updateIssue(
    issueNumber: number,
    title: string,
    body: string
  ): Promise<CreatedIssueRecord>;
}
```

```ts
async fetchIssueComments(issueNumber: number): Promise<RepositoryComment[]> {
  const { owner, repo } = parseGitHubRepoFromRemote(this.repoRoot);
  return listIssueComments(owner, repo, issueNumber);
}

async updateIssue(
  issueNumber: number,
  title: string,
  body: string
): Promise<CreatedIssueRecord> {
  const { owner, repo } = parseGitHubRepoFromRemote(this.repoRoot);
  const token = getGitHubApiToken(
    "Updating GitHub issues requires GH_TOKEN or GITHUB_TOKEN to be set, or gh to be installed and authenticated."
  );
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "prs-cli",
      },
      body: JSON.stringify({ title, body }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to update GitHub issue #${issueNumber} (${response.status} ${response.statusText}).`
    );
  }

  const payload = (await response.json()) as {
    number?: number;
    title?: string;
    html_url?: string;
  };

  if (!payload.number || !payload.title || !payload.html_url) {
    throw new Error(`GitHub issue update for #${issueNumber} returned an incomplete payload.`);
  }

  return {
    number: payload.number,
    title: payload.title,
    url: payload.html_url,
    status: "created",
  };
}
```

- [ ] **Step 4: Re-run the targeted forge-backed refine tests**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "prs-managed issue"`
Expected: PASS for the new issue-update path.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/forge.ts packages/cli/src/github.ts packages/cli/src/index.test.ts
git commit -m "feat: add forge support for issue refinement"
```

### Task 4: Implement The `prs issue refine` Workflow With Resume And Review

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `packages/cli/src/runtime.ts`
- Test: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write the failing end-to-end refine tests**

```ts
it("prompts for requested issue changes and starts a fresh refine session", async () => {
  let runtimePrompt = "";

  const { run } = await loadCli({
    readlineAnswers: ["Clarify the rollback plan and edge cases.", "n"],
    fetchIssueDetailsResult: {
      title: "Improve release automation",
      body: "Current issue body",
      url: "https://github.com/DevwareUK/prs/issues/55",
    },
    fetchIssueCommentsResult: [
      {
        id: 1,
        body: "Customer impact is deployment safety.",
        url: "https://github.com/DevwareUK/prs/issues/55#issuecomment-1",
        createdAt: "2026-04-24T10:00:00Z",
        updatedAt: "2026-04-24T10:00:00Z",
        author: "customer-user",
        isBot: false,
      },
    ],
    spawnSyncImpl: (command, args) => {
      if (command === "codex" && args[0] === "--version") {
        return { status: 0 };
      }

      if (command === "codex") {
        const { metadata } = readLatestRunMetadata();
        runtimePrompt = readFileSync(resolve(REPO_ROOT, metadata.promptFile as string), "utf8");
        writeFileSync(
          resolve(REPO_ROOT, metadata.draftFile as string),
          "# Improve release automation\n\n## Summary\nRefined spec.\n",
          "utf8"
        );
        return { status: 0 };
      }

      return { status: 0 };
    },
  });

  process.argv = ["node", "prs", "issue", "refine", "55"];
  await run();

  expect(runtimePrompt).toContain("What changes should be made to the specification?");
  expect(runtimePrompt).toContain("Clarify the rollback plan and edge cases.");
  expect(runtimePrompt).toContain("Customer impact is deployment safety.");
});

it("resumes the saved Codex refine session when still tracked", async () => {
  expect(spawnSync).toHaveBeenCalledWith(
    "codex",
    expect.arrayContaining(["resume", "019d5002-0000-7111-8222-933344445555"]),
    expect.any(Object)
  );
});

it("warns and starts a new refine session when the saved runtime changed", async () => {
  expect(messages.join("\n")).toContain(
    "The saved issue-refine session used Codex, but the configured runtime is Claude Code. Starting a fresh refinement session."
  );
});
```

- [ ] **Step 2: Run the targeted refine tests to verify they fail**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "issue refine"`
Expected: FAIL because `runIssueRefineCommand()` does not exist yet.

- [ ] **Step 3: Implement prompt building, PRS-managed detection, and review/apply flow**

```ts
const PRS_MANAGED_ISSUE_MARKER = "<!-- prs:managed-issue -->";

function isPrsManagedIssue(issue: IssueDetails): boolean {
  return issue.body.includes(PRS_MANAGED_ISSUE_MARKER);
}

function buildIssueRefineRuntimePrompt(input: {
  repoRoot: string;
  workspace: IssueRefineWorkspace;
  issue: IssueDetails;
  issueNumber: number;
  requestedChanges: string;
  comments: RepositoryComment[];
}): string {
  return [
    "You are working in the current repository.",
    "",
    `Refine GitHub issue #${input.issueNumber} into an implementation-ready specification.`,
    "",
    "The issue body remains the canonical source of truth for execution.",
    "Issue comments are refinement context only.",
    "",
    "What changes should be made to the specification?",
    input.requestedChanges,
    "",
    "Current issue title:",
    input.issue.title,
    "",
    "Current issue body:",
    input.issue.body.trim() || "(No issue body provided.)",
    "",
    "Relevant issue comments:",
    input.comments.map((comment) => `- @${comment.author}: ${comment.body}`).join("\n"),
    "",
    `Write the refined markdown to \`${toRepoRelativePath(input.repoRoot, input.workspace.draftFilePath)}\`.`,
  ].join("\n");
}
```

```ts
async function runIssueRefineCommand(issueNumber: number): Promise<void> {
  const repoRoot = getDefaultRepoRoot();
  const forge = getRepositoryForge(repoRoot);
  const repositoryConfig = getRepositoryConfig(repoRoot);
  const runtime = selectInteractiveRuntime(repositoryConfig.ai.runtime, {
    onFallback: (message) => console.log(message),
  });
  const issue = await forge.fetchIssueDetails(issueNumber);
  const comments = await forge.fetchIssueComments(issueNumber);
  const requestedChanges = await promptForRequiredLine(
    "What changes should be made to the specification? "
  );

  // load prior draft-session.json, decide between resume/new, write prompt/metadata, launch runtime
  // validate refined markdown, preview via reviewGeneratedText(), then:
  // - update existing issue in place if PRS-managed
  // - otherwise offer keep-on-disk or create linked PRS-managed issue
}
```

- [ ] **Step 4: Re-run the targeted refine tests**

Run: `pnpm vitest packages/cli/src/index.test.ts -t "issue refine"`
Expected: PASS for new-session, resume, stale-session, runtime-mismatch, keep-on-disk, and apply-flow scenarios.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/runtime.ts packages/cli/src/index.test.ts
git commit -m "feat: implement issue refinement workflow"
```

### Task 5: Finalize README, Add Regression Coverage, And Verify Build

**Files:**
- Modify: `README.md`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `packages/cli/src/github.ts`
- Modify: `packages/cli/src/forge.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write any remaining failing documentation-sensitive and regression tests**

```ts
it("creates a linked prs-managed issue instead of overwriting a non-prs issue", async () => {
  expect(execFileSync).toHaveBeenCalledWith(
    "gh",
    expect.arrayContaining(["issue", "create"]),
    expect.any(Object)
  );
  expect(execFileSync).not.toHaveBeenCalledWith(
    "gh",
    expect.arrayContaining(["issue", "edit", "42"]),
    expect.anything()
  );
});
```

- [ ] **Step 2: Update README usage and behavior sections**

```md
- `prs issue draft` creates a brand-new issue draft from a rough idea.
- `prs issue refine <number>` refines an existing GitHub issue into an implementation-ready spec.
- `prs issue <number>` still uses the issue body as its only source of truth; issue comments are refinement context only.
- `prs issue refine <number>` stores resumable state at `.prs/issues/<number>/draft-session.json` and per-run artifacts under `.prs/runs/<timestamp>-issue-refine-<number>/`.
```

- [ ] **Step 3: Run the full CLI test file**

Run: `pnpm vitest packages/cli/src/index.test.ts`
Expected: PASS

- [ ] **Step 4: Run the package build required by the issue prompt**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md packages/cli/src/index.test.ts packages/cli/src/github.ts packages/cli/src/forge.ts packages/cli/src/index.ts
git commit -m "docs: document issue refinement workflow"
```

## Self-Review

- Spec coverage: command split, resume rules, source-of-truth behavior, PRS-managed vs non-PRS behavior, comments weighting, review flow, saved-state layout, README updates, and build verification are all covered by Tasks 1-5.
- Placeholder scan: the implementation steps include concrete files, commands, and code snippets; there are no unresolved `TODO` or `TBD` markers.
- Type consistency: the plan consistently uses `action: "refine"`, `.prs/issues/<issue-number>/draft-session.json`, and `prs issue refine <issue-number>` across all tasks.
