import { describe, expect, it } from "vitest";
import {
  TestSuggestionAddressedAssessmentInput,
  TestSuggestionAddressedAssessmentOutput,
  TestSuggestionsInput,
  TestSuggestionsOutput,
} from "./test-suggestions";

describe("TestSuggestionsInput", () => {
  it("accepts optional resolved suggestion context", () => {
    expect(
      TestSuggestionsInput.parse({
        diff: "diff --git a/file.ts b/file.ts",
        resolvedSuggestions: [
          {
            area: "Template Rendering",
            testType: "integration",
            behavior: "Verify that the order detail template renders expected fields.",
            protectedPaths: [
              "web/themes/custom/bos/templates/commerce-order--user.html.twig",
            ],
            likelyLocations: ["web/themes/custom/bos/src/userOrderDetailPage.test.ts"],
            resolvedAt: "2026-04-28T14:20:00.000Z",
            commitSha: "abc123",
          },
        ],
      })
    ).toMatchObject({
      resolvedSuggestions: [
        expect.objectContaining({
          area: "Template Rendering",
          commitSha: "abc123",
        }),
      ],
    });
  });
});

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

  it("accepts zero suggestions when no new unresolved gaps remain", () => {
    expect(
      TestSuggestionsOutput.parse({
        summary: "No new unresolved AI test suggestions were found for the current PR diff.",
        suggestedTests: [],
      })
    ).toMatchObject({ suggestedTests: [] });
  });
});

describe("TestSuggestionAddressedAssessmentInput", () => {
  it("accepts existing checklist suggestions for addressed assessment", () => {
    expect(
      TestSuggestionAddressedAssessmentInput.parse({
        diff: "diff --git a/tests/checkout.test.ts b/tests/checkout.test.ts\n+it('checks out')",
        prTitle: "Add checkout regression test",
        suggestions: [
          {
            suggestionId: "suggestion-1",
            area: "Verify checkout flow",
            addressed: false,
            priority: "high",
            testType: "integration",
            behavior: "Checkout completes successfully.",
            regressionRisk: "Checkout regressions could go unnoticed.",
            value: "It protects the primary purchase path.",
            implementationNote: "Add an integration test for checkout completion.",
          },
        ],
      })
    ).toMatchObject({
      suggestions: [
        {
          suggestionId: "suggestion-1",
          addressed: false,
        },
      ],
    });
  });
});

describe("TestSuggestionAddressedAssessmentOutput", () => {
  it("accepts addressed suggestion IDs with evidence", () => {
    expect(
      TestSuggestionAddressedAssessmentOutput.parse({
        addressedSuggestions: [
          {
            suggestionId: "suggestion-1",
            addressed: true,
            evidence: "The diff adds tests/checkout.test.ts covering checkout completion.",
          },
        ],
      })
    ).toMatchObject({
      addressedSuggestions: [
        {
          suggestionId: "suggestion-1",
          addressed: true,
        },
      ],
    });
  });

  it("rejects empty IDs and unexpected output fields", () => {
    expect(() =>
      TestSuggestionAddressedAssessmentOutput.parse({
        addressedSuggestions: [
          {
            suggestionId: "",
            addressed: true,
            evidence: "Missing usable ID.",
          },
        ],
      })
    ).toThrow();

    expect(() =>
      TestSuggestionAddressedAssessmentOutput.parse({
        addressedSuggestions: [
          {
            suggestionId: "suggestion-1",
            addressed: true,
            evidence: "The diff adds a focused test.",
            replacementSuggestion: "Invent new work",
          },
        ],
      })
    ).toThrow();
  });
});
