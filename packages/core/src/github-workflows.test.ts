import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const workflowPaths = [
  ".github/workflows/issue-to-pr.yml",
  ".github/workflows/pr-description.yml",
  ".github/workflows/review-summary.yml",
  ".github/workflows/test-backlog.yml",
];

describe("GitHub workflows", () => {
  it.each(workflowPaths)(
    "runs the shared root test command after building in %s",
    (workflowPath) => {
      const workflow = readFileSync(resolve(repoRoot, workflowPath), "utf8");
      const buildStepIndex = workflow.indexOf("run: pnpm build");
      const testStepIndex = workflow.indexOf("run: pnpm test");

      expect(buildStepIndex).toBeGreaterThan(-1);
      expect(testStepIndex).toBeGreaterThan(buildStepIndex);
    }
  );
});
