import { describe, expect, it } from "vitest";
import { TestSuggestionsOutput } from "./test-suggestions";

describe("TestSuggestionsOutput", () => {
  it("accepts implementation-ready structured test suggestions", () => {
    expect(
      TestSuggestionsOutput.parse({
        summary: "The PR adds a new CLI handoff that needs workflow-level coverage.",
        suggestedTests: [
          {
            area: "Verify pr fix-tests preserves rich suggestion context",
            priority: "high",
            testType: "integration",
            behavior:
              "Selecting a managed AI test suggestion should write a snapshot and metadata with the full task context.",
            regressionRisk:
              "The runtime handoff could lose behavior details or implementation guidance when the selector changes.",
            value:
              "This keeps the selected suggestion directly actionable for the implementing engineer.",
            protectedPaths: [
              "packages/cli/src/workflows/pr-fix-tests/run.ts",
              "packages/cli/src/workflows/pr-fix-tests/workspace.ts",
            ],
            likelyLocations: [
              "packages/cli/src/index.test.ts",
              "packages/cli/src/workflows/pr-fix-tests/workspace.test.ts",
            ],
            edgeCases: [
              "The managed comment exists but omits the implementation note.",
            ],
            implementationNote:
              "Add an integration test that selects one suggestion and asserts the generated run artifacts keep the richer fields.",
          },
        ],
        edgeCases: [
          "Keep malformed managed comments failing clearly instead of silently skipping fields.",
        ],
      })
    ).toMatchObject({
      suggestedTests: [
        expect.objectContaining({
          testType: "integration",
          behavior: expect.stringContaining("Selecting a managed AI test suggestion"),
          regressionRisk: expect.stringContaining("lose behavior details"),
          implementationNote: expect.stringContaining("generated run artifacts"),
        }),
      ],
    });
  });

  it("rejects suggestions missing the issue-ready implementation note", () => {
    expect(() =>
      TestSuggestionsOutput.parse({
        summary: "Missing implementation guidance should fail validation.",
        suggestedTests: [
          {
            area: "Broken suggestion",
            priority: "medium",
            testType: "integration",
            behavior: "A behavior is provided.",
            regressionRisk: "A regression risk is provided.",
            value: "The suggestion still lacks the task-ready note.",
          },
        ],
      })
    ).toThrow(/implementationNote/i);
  });
});
