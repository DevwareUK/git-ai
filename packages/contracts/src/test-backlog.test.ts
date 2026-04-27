import { describe, expect, it } from "vitest";
import { TestBacklogOutput } from "./test-backlog";

function validPayload() {
  return {
    summary: "Repository scan found no tests and recommends a baseline harness.",
    currentTestingSetup: {
      status: "none",
      hasTests: false,
      testFileCount: 0,
      frameworks: [],
      evidence: [],
      testDirectories: [],
      notes: ["No existing test files were detected."],
      frameworkRecommendation: {
        recommended: "Vitest",
        rationale: "Vitest fits this TypeScript pnpm workspace.",
        alternatives: [
          "Jest is mature but more configuration-heavy.",
          "node:test is minimal but less ergonomic for CLI coverage.",
        ],
      },
      ciIntegration: {
        status: "missing",
        hasGitHubActions: false,
        workflows: [],
        evidence: [],
        notes: ["No GitHub Actions workflows were detected."],
      },
    },
    notableCoverageGaps: ["Adopt Vitest and add baseline monorepo test wiring (high)"],
    findings: [
      {
        id: "initial-test-harness",
        title: "Adopt Vitest and add baseline monorepo test wiring",
        priority: "high",
        rationale: "A baseline harness is required before adding package-level tests.",
        suggestedTestTypes: ["unit", "smoke"],
        relatedPaths: ["package.json"],
        issueTitle: "Adopt Vitest and add baseline monorepo test wiring",
        issueBody: "## Summary\nAdd Vitest.",
      },
    ],
  };
}

describe("TestBacklogOutput", () => {
  it("accepts framework recommendations and CI integration metadata", () => {
    expect(TestBacklogOutput.parse(validPayload())).toMatchObject({
      currentTestingSetup: {
        frameworkRecommendation: {
          recommended: "Vitest",
        },
        ciIntegration: {
          status: "missing",
        },
      },
    });
  });

  it("rejects invalid CI integration statuses", () => {
    expect(() =>
      TestBacklogOutput.parse({
        ...validPayload(),
        currentTestingSetup: {
          ...validPayload().currentTestingSetup,
          ciIntegration: {
            ...validPayload().currentTestingSetup.ciIntegration,
            status: "manual-only",
          },
        },
      })
    ).toThrow();
  });

  it("rejects empty framework recommendation strings", () => {
    expect(() =>
      TestBacklogOutput.parse({
        ...validPayload(),
        currentTestingSetup: {
          ...validPayload().currentTestingSetup,
          frameworkRecommendation: {
            ...validPayload().currentTestingSetup.frameworkRecommendation,
            recommended: "",
          },
        },
      })
    ).toThrow();
  });
});
