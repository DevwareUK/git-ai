export const RESOLVED_TEST_SUGGESTIONS_START_MARKER =
  "<!-- prs:test-suggestions:resolved-start -->";
export const RESOLVED_TEST_SUGGESTIONS_END_MARKER =
  "<!-- prs:test-suggestions:resolved-end -->";

export function stripResolvedTestSuggestionsBlocks(body: string): string {
  const lines = body.split(/\r?\n/);
  const result: string[] = [];
  let insideResolvedBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === RESOLVED_TEST_SUGGESTIONS_START_MARKER) {
      insideResolvedBlock = true;
      continue;
    }

    if (trimmed === RESOLVED_TEST_SUGGESTIONS_END_MARKER) {
      insideResolvedBlock = false;
      continue;
    }

    if (!insideResolvedBlock) {
      result.push(line);
    }
  }

  return result.join("\n");
}
