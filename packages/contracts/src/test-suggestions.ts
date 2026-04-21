import { z } from "zod";

const TestSuggestionString = z.string().trim().min(1);

const TestSuggestionItem = z.object({
  area: TestSuggestionString.min(1, "area must be non-empty"),
  priority: z.enum(["high", "medium", "low"]),
  testType: TestSuggestionString.min(1, "testType must be non-empty"),
  behavior: TestSuggestionString.min(1, "behavior must be non-empty"),
  regressionRisk: TestSuggestionString.min(
    1,
    "regressionRisk must be non-empty"
  ),
  value: TestSuggestionString.min(1, "value must be non-empty"),
  protectedPaths: z.array(TestSuggestionString).optional(),
  likelyLocations: z.array(TestSuggestionString).optional(),
  edgeCases: z.array(TestSuggestionString).optional(),
  implementationNote: TestSuggestionString.min(
    1,
    "implementationNote must be non-empty"
  ),
});

export const TestSuggestionsInput = z.object({
  diff: z.string().trim().min(1),
  prTitle: z.string().trim().min(1).optional(),
  prBody: z.string().trim().min(1).optional(),
});

export type TestSuggestionsInputType = z.infer<typeof TestSuggestionsInput>;

export const TestSuggestionsOutput = z.object({
  summary: TestSuggestionString.min(1, "summary must be non-empty"),
  suggestedTests: z
    .array(TestSuggestionItem)
    .min(1, "suggestedTests must contain at least one item"),
  edgeCases: z.array(TestSuggestionString).optional(),
});

export type TestSuggestionsOutputType = z.infer<typeof TestSuggestionsOutput>;
