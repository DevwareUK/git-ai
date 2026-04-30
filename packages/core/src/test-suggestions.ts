import {
  TestSuggestionAddressedAssessmentInput,
  TestSuggestionAddressedAssessmentInputType,
  TestSuggestionAddressedAssessmentOutput,
  TestSuggestionAddressedAssessmentOutputType,
  TestSuggestionsInput,
  TestSuggestionsInputType,
  TestSuggestionsOutput,
  TestSuggestionsOutputType,
} from "@prs/contracts";
import { AIProvider } from "@prs/providers";
import { DIFF_GROUNDED_SYSTEM_PROMPT_LINES } from "./diff-task";
import {
  generateStructuredOutput,
  normalizeNullableFields,
} from "./structured-generation";

const TEST_SUGGESTIONS_SYSTEM_PROMPT = [
  "You are a senior software engineer planning automated tests for a GitHub pull request.",
  "Suggest practical, implementation-focused tests that would add meaningful coverage.",
  ...DIFF_GROUNDED_SYSTEM_PROMPT_LINES,
  "Prefer high-value tests and edge cases over exhaustive low-signal lists.",
  "Only suggest tests, locations, or edge cases supported by the diff or provided PR context.",
  "Do not generate inline review comments or full test code.",
].join(" ");

const TEST_SUGGESTION_ADDRESSED_ASSESSMENT_SYSTEM_PROMPT = [
  "You are a senior software engineer assessing whether existing PR test suggestions have been addressed.",
  "Only mark a suggestion addressed when automated tests or test-related changes visible in the diff directly cover the requested behavior.",
  ...DIFF_GROUNDED_SYSTEM_PROMPT_LINES,
  "Do not invent replacement suggestions or new test work.",
].join(" ");

function buildPrompt(input: TestSuggestionsInputType): string {
  const contextLines: string[] = [];
  if (input.prTitle) {
    contextLines.push(`PR Title: ${input.prTitle}`);
  }
  if (input.prBody) {
    contextLines.push(`PR Body: ${input.prBody}`);
  }
  const resolvedLines = (input.resolvedSuggestions ?? []).flatMap((suggestion, index) => [
    `${index + 1}. ${suggestion.area}`,
    `   Test type: ${suggestion.testType}`,
    `   Behavior: ${suggestion.behavior}`,
    `   Resolved commit: ${suggestion.commitSha}`,
    `   Resolved at: ${suggestion.resolvedAt}`,
    ...(suggestion.protectedPaths?.length
      ? [`   Protected paths: ${suggestion.protectedPaths.join(", ")}`]
      : []),
    ...(suggestion.likelyLocations?.length
      ? [`   Likely locations: ${suggestion.likelyLocations.join(", ")}`]
      : []),
  ]);

  return [
    "Generate pull request test suggestions from the provided diff.",
    "Focus on high-value automated tests that would improve confidence in the changed behavior.",
    "Prefer practical, implementation-ready test tasks over exhaustive or trivial checks.",
    "Use the PR title/body only as supporting context and prefer the diff when they conflict.",
    "Each suggestion should be self-contained enough to copy into an implementation task or issue.",
    "Only include likely test locations when the diff supports a plausible place to add or extend tests.",
    "Only include protected paths or changed code paths when the diff supports a concrete mapping.",
    "Attach edge cases directly to the relevant suggestion whenever possible; reserve the top-level edgeCases list for shared or cross-cutting cases.",
    "If the diff is small or low risk and no unresolved coverage gap remains, return an empty suggestedTests array with a clear summary.",
    "Return strictly valid JSON in this exact shape:",
    "{",
    '  "summary": string,',
    '  "suggestedTests": [',
    "    {",
    '      "area": string,',
    '      "priority": "high" | "medium" | "low",',
    '      "testType": string,',
    '      "behavior": string,',
    '      "regressionRisk": string,',
    '      "value": string,',
    '      "protectedPaths"?: string[],',
    '      "likelyLocations"?: string[],',
    '      "edgeCases"?: string[],',
    '      "implementationNote": string',
    "    }",
    "  ],",
    '  "edgeCases"?: string[]',
    "}",
    "",
    'The "summary" should be a short paragraph describing the main testing opportunities created by the change.',
    '"suggestedTests" should contain 0 to 5 concrete, implementation-focused test areas grounded in the diff.',
    'Use "priority" to communicate relative value, where "high" means the test would meaningfully reduce risk.',
    '"testType" should be a short label such as unit, integration, component, end-to-end, workflow, or regression.',
    '"behavior" should describe the user flow or behavior under test.',
    '"regressionRisk" should describe the likely breakage this test would help prevent.',
    '"value" should explain why the test is worth adding.',
    '"protectedPaths" should list the changed files or code paths this test would protect when the diff makes them clear.',
    'Omit "edgeCases" when there are no concrete edge cases reasonably supported by the diff.',
    '"implementationNote" should read like a short issue-ready instruction for whoever adds the test.',
    "Do not wrap JSON in markdown fences.",
    "",
    ...(contextLines.length > 0
      ? ["Supporting context (optional, may be incomplete):", ...contextLines, ""]
      : []),
    ...(resolvedLines.length > 0
      ? [
          "Previously addressed test suggestions:",
          "Do not repeat already addressed test work unless the current diff introduces materially new behavior that justifies a new suggestion.",
          ...resolvedLines,
          "",
        ]
      : []),
    "Diff:",
    input.diff,
  ].join("\n");
}

function buildAddressedAssessmentPrompt(
  input: TestSuggestionAddressedAssessmentInputType
): string {
  const contextLines: string[] = [];
  if (input.prTitle) {
    contextLines.push(`PR Title: ${input.prTitle}`);
  }
  if (input.prBody) {
    contextLines.push(`PR Body: ${input.prBody}`);
  }

  const uncheckedSuggestions = input.suggestions.filter(
    (suggestion) => !suggestion.addressed
  );
  const suggestionLines = uncheckedSuggestions.flatMap((suggestion, index) => [
    `${index + 1}. ${suggestion.suggestionId}: ${suggestion.area}`,
    `   Priority: ${suggestion.priority}`,
    `   Test type: ${suggestion.testType}`,
    `   Behavior: ${suggestion.behavior}`,
    `   Regression risk: ${suggestion.regressionRisk}`,
    `   Why it matters: ${suggestion.value}`,
    `   Implementation note: ${suggestion.implementationNote}`,
    ...(suggestion.protectedPaths?.length
      ? [`   Protected paths: ${suggestion.protectedPaths.join(", ")}`]
      : []),
    ...(suggestion.likelyLocations?.length
      ? [`   Likely locations: ${suggestion.likelyLocations.join(", ")}`]
      : []),
    ...(suggestion.edgeCases?.length
      ? [`   Edge cases: ${suggestion.edgeCases.join("; ")}`]
      : []),
  ]);

  return [
    "Determine whether existing unchecked AI test suggestions have now been addressed by the current PR diff.",
    "Assess only the suggestions listed below. Do not generate new suggestions or replacement text.",
    "Mark a suggestion addressed only when the diff shows automated tests or clearly test-related changes that cover the requested behavior.",
    "Leave a suggestion out when the evidence is weak, indirect, or unrelated to tests.",
    "Use the PR title/body only as supporting context and prefer the diff when they conflict.",
    "Return strictly valid JSON in this exact shape:",
    "{",
    '  "addressedSuggestions": [',
    "    {",
    '      "suggestionId": string,',
    '      "addressed": true,',
    '      "evidence": string',
    "    }",
    "  ]",
    "}",
    "",
    'Only include IDs from the unchecked suggestions list. "evidence" should name the relevant test file or changed test behavior from the diff.',
    "Do not wrap JSON in markdown fences.",
    "",
    ...(contextLines.length > 0
      ? ["Supporting context (optional, may be incomplete):", ...contextLines, ""]
      : []),
    "Unchecked suggestions:",
    ...suggestionLines,
    "",
    "Diff:",
    input.diff,
  ].join("\n");
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePathList(paths: readonly string[] | undefined): string[] {
  return [...new Set((paths ?? []).map((path) => normalizeKeyPart(path)).filter(Boolean))]
    .sort();
}

function buildResolvedSuggestionKey(
  suggestion: Pick<
    NonNullable<TestSuggestionsInputType["resolvedSuggestions"]>[number],
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

function filterResolvedDuplicates(
  output: TestSuggestionsOutputType,
  input: TestSuggestionsInputType
): TestSuggestionsOutputType {
  const resolvedKeys = new Set(
    (input.resolvedSuggestions ?? []).map((suggestion) =>
      buildResolvedSuggestionKey(suggestion)
    )
  );
  if (resolvedKeys.size === 0) {
    return output;
  }

  const suggestedTests = output.suggestedTests.filter(
    (suggestion) => !resolvedKeys.has(buildResolvedSuggestionKey(suggestion))
  );
  if (suggestedTests.length === output.suggestedTests.length) {
    return output;
  }

  if (suggestedTests.length === 0) {
    return {
      summary:
        "No new unresolved AI test suggestions were found for the current PR diff.",
      suggestedTests,
    };
  }

  return {
    ...output,
    suggestedTests,
  };
}

function normalizeModelOutput(value: unknown): unknown {
  const normalizedRoot = normalizeNullableFields(value, ["edgeCases"]);
  if (!normalizedRoot || typeof normalizedRoot !== "object") {
    return normalizedRoot;
  }

  const result = { ...(normalizedRoot as Record<string, unknown>) };
  if (Array.isArray(result.suggestedTests)) {
    result.suggestedTests = result.suggestedTests.map((item) =>
      normalizeNullableFields(item, ["protectedPaths", "likelyLocations", "edgeCases"])
    );
  }

  return result;
}

export async function generateTestSuggestions(
  provider: AIProvider,
  input: TestSuggestionsInputType
): Promise<TestSuggestionsOutputType> {
  const parsedInput = TestSuggestionsInput.parse(input);
  const prompt = buildPrompt(parsedInput);

  const output = await generateStructuredOutput({
    provider,
    systemPrompt: TEST_SUGGESTIONS_SYSTEM_PROMPT,
    prompt,
    schema: TestSuggestionsOutput,
    validationErrorPrefix:
      "Model output failed test suggestions schema validation",
    normalizeParsedJson: normalizeModelOutput,
  });

  return filterResolvedDuplicates(output, parsedInput);
}

export async function assessAddressedTestSuggestions(
  provider: AIProvider,
  input: TestSuggestionAddressedAssessmentInputType
): Promise<TestSuggestionAddressedAssessmentOutputType> {
  const parsedInput = TestSuggestionAddressedAssessmentInput.parse(input);
  const uncheckedSuggestionIds = new Set(
    parsedInput.suggestions
      .filter((suggestion) => !suggestion.addressed)
      .map((suggestion) => suggestion.suggestionId)
  );

  if (uncheckedSuggestionIds.size === 0) {
    return { addressedSuggestions: [] };
  }

  const output = await generateStructuredOutput({
    provider,
    systemPrompt: TEST_SUGGESTION_ADDRESSED_ASSESSMENT_SYSTEM_PROMPT,
    prompt: buildAddressedAssessmentPrompt(parsedInput),
    schema: TestSuggestionAddressedAssessmentOutput,
    validationErrorPrefix:
      "Model output failed test suggestion addressed assessment schema validation",
  });

  return {
    addressedSuggestions: output.addressedSuggestions.filter((suggestion) =>
      uncheckedSuggestionIds.has(suggestion.suggestionId)
    ),
  };
}
