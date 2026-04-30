import { describe, expect, it } from "vitest";
import {
  buildResolvedTestSuggestionsBlock,
  mergeResolvedTestSuggestions,
  parseResolvedTestSuggestionsFromCommentBody,
} from "./resolved";
import type { PullRequestTestSuggestion } from "./types";

const suggestion: PullRequestTestSuggestion = {
  suggestionId: "suggestion-1",
  area: "Template Rendering",
  priority: "high",
  testType: "integration",
  behavior: "Verify that the order detail template renders expected fields.",
  regressionRisk: "Template changes could hide order details.",
  value: "Protects the customer order detail page.",
  protectedPaths: ["web/themes/custom/bos/templates/commerce-order--user.html.twig"],
  likelyLocations: ["web/themes/custom/bos/src/userOrderDetailPage.test.ts"],
  edgeCases: ["Render an order with no items."],
  implementationNote: "Add a template contract test for expected fields.",
};

describe("resolved test suggestions ledger", () => {
  it("round-trips a hidden resolved suggestions block", () => {
    const records = mergeResolvedTestSuggestions([], [suggestion], {
      commitSha: "abc123",
      resolvedAt: "2026-04-28T14:20:00.000Z",
    });

    const block = buildResolvedTestSuggestionsBlock(records);
    expect(block).toContain("<!-- prs:test-suggestions:resolved-start -->");
    expect(parseResolvedTestSuggestionsFromCommentBody(block)).toEqual(records);
  });

  it("returns an empty ledger when the hidden block is missing or malformed", () => {
    expect(parseResolvedTestSuggestionsFromCommentBody("## AI Test Suggestions")).toEqual([]);
    expect(
      parseResolvedTestSuggestionsFromCommentBody(
        "<!-- prs:test-suggestions:resolved-start -->\nnot-json\n<!-- prs:test-suggestions:resolved-end -->"
      )
    ).toEqual([]);
  });

  it("merges selected suggestions by normalized key", () => {
    const first = mergeResolvedTestSuggestions([], [suggestion], {
      commitSha: "abc123",
      resolvedAt: "2026-04-28T14:20:00.000Z",
    });
    const second = mergeResolvedTestSuggestions(first, [suggestion], {
      commitSha: "def456",
      resolvedAt: "2026-04-28T15:00:00.000Z",
    });

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ commitSha: "def456", area: "Template Rendering" });
  });
});
