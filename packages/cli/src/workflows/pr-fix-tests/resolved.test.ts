import { describe, expect, it } from "vitest";
import {
  stripResolvedTestSuggestionsBlocks,
} from "./resolved";

describe("resolved test suggestions ledger", () => {
  it("leaves comments without legacy resolved blocks unchanged", () => {
    expect(stripResolvedTestSuggestionsBlocks("## AI Test Suggestions")).toBe(
      "## AI Test Suggestions"
    );
  });

  it("strips legacy resolved blocks from managed comments", () => {
    const body = [
      "<!-- prs:test-suggestions -->",
      "<!-- prs:test-suggestions:resolved-start -->",
      "[",
      "  { \"commitSha\": \"abc123\" }",
      "]",
      "<!-- prs:test-suggestions:resolved-end -->",
      "## AI Test Suggestions",
    ].join("\n");

    expect(stripResolvedTestSuggestionsBlocks(body)).toBe(
      ["<!-- prs:test-suggestions -->", "## AI Test Suggestions"].join("\n")
    );
  });
});
