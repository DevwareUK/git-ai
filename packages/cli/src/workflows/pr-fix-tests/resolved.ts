import {
  ALL_TEST_SUGGESTIONS_COMMENT_MARKERS,
  TEST_SUGGESTIONS_COMMENT_MARKER,
} from "@prs/contracts";
import type {
  PullRequestResolvedTestSuggestion,
  PullRequestTestSuggestion,
} from "./types";

export const RESOLVED_TEST_SUGGESTIONS_START_MARKER =
  "<!-- prs:test-suggestions:resolved-start -->";
export const RESOLVED_TEST_SUGGESTIONS_END_MARKER =
  "<!-- prs:test-suggestions:resolved-end -->";

type ResolutionMetadata = {
  commitSha: string;
  resolvedAt: string;
};

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePathList(paths: readonly string[] | undefined): string[] {
  return [...new Set((paths ?? []).map((path) => normalizeKeyPart(path)).filter(Boolean))]
    .sort();
}

export function buildResolvedTestSuggestionKey(
  suggestion: Pick<
    PullRequestTestSuggestion,
    "area" | "testType" | "behavior" | "protectedPaths" | "likelyLocations"
  >
): string {
  return JSON.stringify({
    area: normalizeKeyPart(suggestion.area),
    testType: normalizeKeyPart(suggestion.testType),
    behavior: normalizeKeyPart(suggestion.behavior),
    protectedPaths: normalizePathList(suggestion.protectedPaths),
    likelyLocations: normalizePathList(suggestion.likelyLocations),
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function toResolvedRecord(value: unknown): PullRequestResolvedTestSuggestion | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Partial<Record<keyof PullRequestResolvedTestSuggestion, unknown>>;
  if (
    typeof record.key !== "string" ||
    typeof record.area !== "string" ||
    typeof record.testType !== "string" ||
    typeof record.behavior !== "string" ||
    typeof record.regressionRisk !== "string" ||
    typeof record.value !== "string" ||
    typeof record.implementationNote !== "string" ||
    typeof record.resolvedAt !== "string" ||
    typeof record.commitSha !== "string" ||
    !isStringArray(record.protectedPaths) ||
    !isStringArray(record.likelyLocations) ||
    !isStringArray(record.edgeCases)
  ) {
    return undefined;
  }

  return {
    key: record.key,
    area: record.area,
    testType: record.testType,
    behavior: record.behavior,
    regressionRisk: record.regressionRisk,
    value: record.value,
    protectedPaths: record.protectedPaths,
    likelyLocations: record.likelyLocations,
    edgeCases: record.edgeCases,
    implementationNote: record.implementationNote,
    resolvedAt: record.resolvedAt,
    commitSha: record.commitSha,
  };
}

export function parseResolvedTestSuggestionsFromCommentBody(
  body: string
): PullRequestResolvedTestSuggestion[] {
  const startIndex = body.indexOf(RESOLVED_TEST_SUGGESTIONS_START_MARKER);
  const endIndex = body.indexOf(RESOLVED_TEST_SUGGESTIONS_END_MARKER);
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    return [];
  }

  const rawJson = body
    .slice(startIndex + RESOLVED_TEST_SUGGESTIONS_START_MARKER.length, endIndex)
    .trim();
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(toResolvedRecord)
      .filter((record): record is PullRequestResolvedTestSuggestion => Boolean(record));
  } catch {
    return [];
  }
}

export function buildResolvedTestSuggestionsBlock(
  records: PullRequestResolvedTestSuggestion[]
): string {
  return [
    RESOLVED_TEST_SUGGESTIONS_START_MARKER,
    JSON.stringify(records, null, 2),
    RESOLVED_TEST_SUGGESTIONS_END_MARKER,
  ].join("\n");
}

export function mergeResolvedTestSuggestions(
  existingRecords: PullRequestResolvedTestSuggestion[],
  selectedSuggestions: PullRequestTestSuggestion[],
  metadata: ResolutionMetadata
): PullRequestResolvedTestSuggestion[] {
  const recordsByKey = new Map<string, PullRequestResolvedTestSuggestion>();
  for (const record of existingRecords) {
    recordsByKey.set(record.key, record);
  }

  for (const suggestion of selectedSuggestions) {
    const key = buildResolvedTestSuggestionKey(suggestion);
    recordsByKey.set(key, {
      key,
      area: suggestion.area,
      testType: suggestion.testType,
      behavior: suggestion.behavior,
      regressionRisk: suggestion.regressionRisk,
      value: suggestion.value,
      protectedPaths: suggestion.protectedPaths,
      likelyLocations: suggestion.likelyLocations,
      edgeCases: suggestion.edgeCases,
      implementationNote: suggestion.implementationNote,
      resolvedAt: metadata.resolvedAt,
      commitSha: metadata.commitSha,
    });
  }

  return [...recordsByKey.values()];
}

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

export function upsertResolvedTestSuggestionsBlock(
  body: string,
  records: PullRequestResolvedTestSuggestion[]
): string {
  const bodyWithoutResolvedBlocks = stripResolvedTestSuggestionsBlocks(body);
  const lines = bodyWithoutResolvedBlocks.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) =>
    ALL_TEST_SUGGESTIONS_COMMENT_MARKERS.includes(line.trim() as never)
  );
  const blockLines = buildResolvedTestSuggestionsBlock(records).split(/\r?\n/);

  if (markerIndex < 0) {
    return [
      TEST_SUGGESTIONS_COMMENT_MARKER,
      ...blockLines,
      bodyWithoutResolvedBlocks,
    ].join("\n");
  }

  return [
    ...lines.slice(0, markerIndex + 1),
    ...blockLines,
    ...lines.slice(markerIndex + 1),
  ].join("\n");
}
