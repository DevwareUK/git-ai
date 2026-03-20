import { describe, expect, it } from "vitest";
import type { RepositoryComment } from "../../forge";
import {
  findManagedTestSuggestionsComment,
  parseManagedTestSuggestionsComment,
  parsePullRequestTestSuggestionSelection,
} from "./selection";

function createComment(
  body: string,
  options: Partial<RepositoryComment> = {}
): RepositoryComment {
  return {
    id: options.id ?? 1,
    body,
    url: options.url ?? "https://github.com/DevwareUK/git-ai/pull/71#issuecomment-1",
    createdAt: options.createdAt ?? "2026-03-20T11:00:00Z",
    updatedAt: options.updatedAt ?? "2026-03-20T11:00:00Z",
    author: options.author ?? "github-actions[bot]",
    isBot: options.isBot ?? true,
  };
}

describe("pr-fix-tests selection helpers", () => {
  it("parses a managed AI test suggestions comment into structured suggestions", () => {
    const comment = createComment(
      [
        "<!-- git-ai-test-suggestions -->",
        "## AI Test Suggestions",
        "",
        "### Overview",
        "The CLI command adds a new workflow that needs direct test coverage.",
        "Keep the parser strict so malformed automation output fails clearly.",
        "",
        "### Suggested test areas",
        "",
        "#### Verify command execution for 'git-ai pr fix-tests'",
        "- Priority: High",
        "- Why it matters: The workflow should fetch PR context and hand the selected tests to Codex.",
        "- Likely locations: `packages/cli/src/index.test.ts`, `packages/cli/src/workflows/pr-fix-tests/run.test.ts`, `packages/cli/src/index.test.ts`",
        "",
        "#### Test parsing of managed AI test suggestions comments",
        "- Priority: Medium",
        "- Why it matters: Parsing needs to stay stable across the managed comment format.",
        "- Likely locations: packages/cli/src/workflows/pr-fix-tests/selection.test.ts, packages/cli/src/index.test.ts, packages/cli/src/workflows/pr-fix-tests/selection.test.ts",
        "",
        "### Edge cases",
        "- Missing the suggested test areas section.",
        "- Invalid priority values should fail clearly.",
        "",
        "### Likely places to add tests",
        "- `packages/cli/src/index.test.ts`",
        "- `packages/cli/src/workflows/pr-fix-tests/selection.test.ts`",
      ].join("\n")
    );

    expect(parseManagedTestSuggestionsComment(comment)).toEqual({
      sourceComment: comment,
      overview: [
        "The CLI command adds a new workflow that needs direct test coverage.",
        "Keep the parser strict so malformed automation output fails clearly.",
      ].join("\n"),
      suggestions: [
        {
          suggestionId: "suggestion-1",
          area: "Verify command execution for 'git-ai pr fix-tests'",
          priority: "high",
          value:
            "The workflow should fetch PR context and hand the selected tests to Codex.",
          likelyLocations: [
            "packages/cli/src/index.test.ts",
            "packages/cli/src/workflows/pr-fix-tests/run.test.ts",
          ],
        },
        {
          suggestionId: "suggestion-2",
          area: "Test parsing of managed AI test suggestions comments",
          priority: "medium",
          value: "Parsing needs to stay stable across the managed comment format.",
          likelyLocations: [
            "packages/cli/src/workflows/pr-fix-tests/selection.test.ts",
            "packages/cli/src/index.test.ts",
          ],
        },
      ],
      edgeCases: [
        "Missing the suggested test areas section.",
        "Invalid priority values should fail clearly.",
      ],
      likelyLocations: [
        "packages/cli/src/index.test.ts",
        "packages/cli/src/workflows/pr-fix-tests/selection.test.ts",
      ],
    });
  });

  it("falls back to combined suggestion locations when the comment omits a likely places section", () => {
    const comment = createComment(
      [
        "<!-- git-ai-test-suggestions -->",
        "## AI Test Suggestions",
        "",
        "### Suggested test areas",
        "",
        "#### First parser gap",
        "- Priority: High",
        "- Why it matters: The first parser branch should be covered.",
        "- Likely locations: `packages/cli/src/workflows/pr-fix-tests/selection.test.ts`, `packages/cli/src/index.test.ts`",
        "",
        "#### Second parser gap",
        "- Priority: Low",
        "- Why it matters: The fallback list should stay deduplicated.",
        "- Likely locations: packages/cli/src/index.test.ts, packages/cli/src/workflows/pr-fix-tests/run.test.ts",
      ].join("\n")
    );

    expect(parseManagedTestSuggestionsComment(comment).likelyLocations).toEqual([
      "packages/cli/src/workflows/pr-fix-tests/selection.test.ts",
      "packages/cli/src/index.test.ts",
      "packages/cli/src/workflows/pr-fix-tests/run.test.ts",
    ]);
  });

  it("selects the newest managed comment and breaks ties by id", () => {
    const older = createComment("<!-- git-ai-test-suggestions -->", {
      id: 10,
      updatedAt: "2026-03-20T10:00:00Z",
    });
    const newer = createComment("<!-- git-ai-test-suggestions -->", {
      id: 11,
      updatedAt: "2026-03-20T11:00:00Z",
    });
    const sameTimeHigherId = createComment("<!-- git-ai-test-suggestions -->", {
      id: 12,
      updatedAt: "2026-03-20T11:00:00Z",
    });
    const unrelated = createComment("Human discussion only", {
      id: 13,
      updatedAt: "2026-03-20T12:00:00Z",
    });

    expect(
      findManagedTestSuggestionsComment([older, unrelated, newer, sameTimeHigherId])
    ).toBe(sameTimeHigherId);
  });

  it("parses interactive suggestion selection and rejects invalid entries", () => {
    expect(parsePullRequestTestSuggestionSelection("all", 3)).toEqual([0, 1, 2]);
    expect(parsePullRequestTestSuggestionSelection("2, 1, 2", 3)).toEqual([1, 0]);
    expect(parsePullRequestTestSuggestionSelection("none", 3)).toEqual([]);
    expect(() => parsePullRequestTestSuggestionSelection("x", 3)).toThrow(
      "Invalid selection. Enter `all`, `none`, or a comma-separated list like `1,2`."
    );
    expect(() => parsePullRequestTestSuggestionSelection("4", 3)).toThrow(
      "Invalid selection. Choose suggestion numbers between 1 and 3."
    );
  });
});
