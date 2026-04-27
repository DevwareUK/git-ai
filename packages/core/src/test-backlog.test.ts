import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeTestBacklog } from "./test-backlog";

function writeFile(repoRoot: string, relativePath: string, contents: string): void {
  const filePath = resolve(repoRoot, relativePath);
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

describe("analyzeTestBacklog", () => {
  it("recommends Vitest and CI setup for a TypeScript repo with no tests", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-no-tests-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify({ name: "fixture-repo", private: true }, null, 2)
    );
    writeFile(repoRoot, "pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    expect(result.currentTestingSetup.status).toBe("none");
    expect(result.currentTestingSetup.frameworkRecommendation?.recommended).toBe("Vitest");
    expect(
      result.currentTestingSetup.frameworkRecommendation?.alternatives.join("\n")
    ).toContain("Jest");
    expect(
      result.currentTestingSetup.frameworkRecommendation?.alternatives.join("\n")
    ).toContain("node:test");
    expect(result.currentTestingSetup.ciIntegration.status).toBe("missing");
    expect(result.findings.map((finding) => finding.id)).toContain("initial-test-harness");
    expect(result.findings.map((finding) => finding.id)).toContain("ci-test-execution");
  });

  it("detects Vitest and CI wiring without recommending a new framework", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
          scripts: {
            test: "vitest run",
          },
          devDependencies: {
            vitest: "^3.2.4",
          },
        },
        null,
        2
      )
    );
    writeFile(
      repoRoot,
      "packages/core/src/example.ts",
      'export function example(): string { return "ok"; }\n'
    );
    writeFile(
      repoRoot,
      "packages/core/src/example.test.ts",
      'import { describe, expect, it } from "vitest";\n' +
        'import { example } from "./example";\n' +
        'describe("example", () => {\n' +
        '  it("returns ok", () => {\n' +
        '    expect(example()).toBe("ok");\n' +
        "  });\n" +
        "});\n"
    );
    writeFile(
      repoRoot,
      ".github/workflows/test.yml",
      [
        "name: Test",
        "on: [push]",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: pnpm test",
      ].join("\n")
    );

    const result = await analyzeTestBacklog({
      repoRoot,
      maxFindings: 10,
    });

    expect(result.currentTestingSetup.frameworks).toContain("Vitest");
    expect(result.currentTestingSetup.status).toBe("established");
    expect(result.currentTestingSetup.ciIntegration.status).toBe("established");
    expect(result.currentTestingSetup.frameworkRecommendation).toBeUndefined();
    expect(result.findings.map((finding) => finding.id)).not.toContain(
      "initial-test-harness"
    );
  });

  it("ignores excluded test paths from the repository scan", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-exclude-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
        },
        null,
        2
      )
    );
    writeFile(
      repoRoot,
      "packages/core/src/example.ts",
      'export function example(): string { return "ok"; }\n'
    );
    writeFile(
      repoRoot,
      "generated/tests/example.test.ts",
      'import { describe, it } from "vitest";\n' +
        'describe("generated", () => {\n' +
        '  it("is ignored", () => {});\n' +
        "});\n"
    );

    const result = await analyzeTestBacklog({
      excludePaths: ["generated/**"],
      repoRoot,
      maxFindings: 10,
    });

    expect(result.currentTestingSetup.hasTests).toBe(false);
    expect(result.currentTestingSetup.testFileCount).toBe(0);
  });

  it("recommends Vitest as a complement when only browser tooling is detected", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-browser-only-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
          devDependencies: {
            "@playwright/test": "^1.0.0",
          },
        },
        null,
        2
      )
    );
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    expect(result.currentTestingSetup.frameworks).toContain("Playwright");
    expect(result.currentTestingSetup.frameworkRecommendation?.recommended).toBe("Vitest");
    expect(result.currentTestingSetup.frameworkRecommendation?.rationale).toContain("complement");
    expect(result.findings.map((finding) => finding.id)).toContain("initial-test-harness");
  });

  it.each([
    ["Vitest", { vitest: "^3.2.4" }],
    ["Jest", { jest: "^30.0.0" }],
  ])("does not create a baseline harness issue when %s is detected", async (_name, devDependencies) => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-framework-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
          devDependencies,
        },
        null,
        2
      )
    );
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    expect(result.currentTestingSetup.frameworkRecommendation).toBeUndefined();
    expect(result.findings.map((finding) => finding.id)).not.toContain("initial-test-harness");
  });

  it("classifies workflows without recognized test commands as missing CI", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-ci-missing-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^3.2.4" },
        },
        null,
        2
      )
    );
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");
    writeFile(repoRoot, "packages/core/src/example.test.ts", "import { it } from 'vitest';\nit('works', () => {});\n");
    writeFile(
      repoRoot,
      ".github/workflows/build.yml",
      ["name: Build", "on: [pull_request]", "jobs:", "  build:", "    steps:", "      - run: pnpm build"].join("\n")
    );

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    expect(result.currentTestingSetup.ciIntegration.status).toBe("missing");
    expect(result.findings.map((finding) => finding.id)).toContain("ci-test-execution");
  });

  it("classifies manual-only test workflows as partial CI", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-ci-partial-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^3.2.4" },
        },
        null,
        2
      )
    );
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");
    writeFile(repoRoot, "packages/core/src/example.test.ts", "import { it } from 'vitest';\nit('works', () => {});\n");
    writeFile(
      repoRoot,
      ".github/workflows/test-backlog.yml",
      [
        "name: Test Backlog",
        "on:",
        "  workflow_dispatch:",
        "jobs:",
        "  test:",
        "    steps:",
        "      - run: pnpm test",
      ].join("\n")
    );

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    expect(result.currentTestingSetup.ciIntegration.status).toBe("partial");
    expect(result.currentTestingSetup.ciIntegration.notes.join("\n")).toContain("manual");
    expect(result.findings.map((finding) => finding.id)).toContain("ci-test-execution");
  });

  it("classifies pull request or push test workflows as established CI", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-ci-established-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify(
        {
          name: "fixture-repo",
          private: true,
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^3.2.4" },
        },
        null,
        2
      )
    );
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");
    writeFile(repoRoot, "packages/core/src/example.test.ts", "import { it } from 'vitest';\nit('works', () => {});\n");
    writeFile(
      repoRoot,
      ".github/workflows/test.yml",
      [
        "name: Test",
        "on:",
        "  pull_request:",
        "  push:",
        "jobs:",
        "  test:",
        "    steps:",
        "      - run: pnpm install",
        "      - run: pnpm build",
        "      - run: pnpm test",
      ].join("\n")
    );

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    expect(result.currentTestingSetup.ciIntegration.status).toBe("established");
    expect(result.findings.map((finding) => finding.id)).not.toContain("ci-test-execution");
  });

  it("generates focused findings for CLI, core analyzer, and contract surfaces", async () => {
    const result = await analyzeTestBacklog({ repoRoot: resolve("."), maxFindings: 5 });
    const ids = result.findings.map((finding) => finding.id);

    expect(ids).toContain("prs-test-backlog-cli");
    expect(ids).toContain("prs-issue-cli");
    expect(ids).toContain("core-test-backlog-analysis");
    expect(ids).toContain("test-backlog-contract");
    expect(ids).not.toContain("cli");
    expect(ids).not.toContain("core");
    expect(result.findings.find((finding) => finding.id === "prs-test-backlog-cli")?.issueTitle).toContain(
      "prs test-backlog"
    );
  });

  it("renders implementation-ready issue body sections for every finding", async () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "prs-test-backlog-body-"));

    writeFile(
      repoRoot,
      "package.json",
      JSON.stringify({ name: "fixture-repo", private: true }, null, 2)
    );
    writeFile(repoRoot, "packages/core/src/example.ts", "export const value = 1;\n");

    const result = await analyzeTestBacklog({ repoRoot, maxFindings: 10 });

    for (const finding of result.findings) {
      for (const heading of [
        "## Summary",
        "## Why this matters",
        "## Why this approach fits this repository",
        "## Proposed implementation",
        "## First tests to add",
        "## Target paths",
        "## Acceptance criteria",
      ]) {
        expect(finding.issueBody).toContain(heading);
      }
    }

    expect(
      result.findings.find((finding) => finding.id === "initial-test-harness")?.issueBody
    ).toContain("## Alternatives considered");
  });
});
