import {
  PRDescriptionInput,
  PRDescriptionInputType,
  PRDescriptionOutput,
  PRDescriptionOutputType,
} from "@git-ai/contracts";
import { AIProvider } from "@git-ai/providers";
import {
  buildDiffTaskPrompt,
  DIFF_GROUNDED_SYSTEM_PROMPT_LINES,
} from "./diff-task";
import {
  generateStructuredOutput,
  normalizeNullableFields,
} from "./structured-generation";

const PR_DESCRIPTION_SYSTEM_PROMPT =
  [
    "You are a senior software engineer writing a GitHub pull request description.",
    "Be concise but informative.",
    ...DIFF_GROUNDED_SYSTEM_PROMPT_LINES,
  ].join(" ");

function buildPrompt(input: PRDescriptionInputType): string {
  const contextLines: string[] = [];
  if (input.issueTitle) {
    contextLines.push(`Issue Title: ${input.issueTitle}`);
  }
  if (input.issueBody) {
    contextLines.push(`Issue Body: ${input.issueBody}`);
  }

  return buildDiffTaskPrompt({
    taskLine: "Generate a GitHub pull request title and body from the provided diff.",
    guidanceLines: [
      "Use issue context only as supporting context and prefer the diff when they conflict.",
      'The "body" must be markdown using these section headings:',
      "## Summary",
      "High-level explanation of what changed.",
      "",
      "## Changes",
      "Bullet list of important changes.",
      "",
      "## Testing",
      "How a reviewer could validate the change.",
      "",
      "## Risk",
      "Potential risks, rollout notes, or migration concerns.",
    ],
    schemaLines: [
      '  "title": string,',
      '  "body": string,',
      '  "testingNotes": string | null,',
      '  "riskNotes": string | null',
    ],
    contextLines:
      contextLines.length > 0
        ? ["Supporting context (optional, may be incomplete):", ...contextLines]
        : undefined,
    diff: input.diff,
  });
}

export async function generatePRDescription(
  provider: AIProvider,
  input: PRDescriptionInputType
): Promise<PRDescriptionOutputType> {
  const parsedInput = PRDescriptionInput.parse(input);
  const prompt = buildPrompt(parsedInput);
  const modelOutput = await generateStructuredOutput({
    provider,
    systemPrompt: PR_DESCRIPTION_SYSTEM_PROMPT,
    prompt,
    schema: PRDescriptionOutput,
    validationErrorPrefix:
      "Model output failed PR description schema validation",
    normalizeParsedJson: (value) =>
      normalizeNullableFields(value, ["testingNotes", "riskNotes"]),
  });

  return modelOutput;
}
