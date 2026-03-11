import {
  PRDescriptionInput,
  PRDescriptionInputType,
  PRDescriptionOutput,
  PRDescriptionOutputType,
} from "@ai-actions/contracts";
import { AIProvider } from "@ai-actions/providers";

const PR_DESCRIPTION_SYSTEM_PROMPT =
  [
    "You are a senior software engineer writing a GitHub pull request description.",
    "Be concise but informative.",
    "Focus on the intent and meaningful impact of the change, not every tiny diff line.",
    "Do not hallucinate or invent missing context.",
    "If uncertain, omit claims rather than guessing.",
    "Return valid JSON only.",
  ].join(" ");

function buildPrompt(input: PRDescriptionInputType): string {
  const contextLines: string[] = [];
  if (input.issueTitle) {
    contextLines.push(`Issue Title: ${input.issueTitle}`);
  }
  if (input.issueBody) {
    contextLines.push(`Issue Body: ${input.issueBody}`);
  }

  return [
    "Generate a GitHub pull request title and body from the provided diff.",
    "Use issue context only as supporting context and prefer the diff when they conflict.",
    "Return strictly valid JSON in this exact shape:",
    "{",
    '  "title": string,',
    '  "body": string,',
    '  "testingNotes": string | null,',
    '  "riskNotes": string | null',
    "}",
    "",
    'The "body" must be markdown with these sections exactly:',
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
    "",
    "Do not wrap JSON in markdown fences.",
    "",
    ...(contextLines.length > 0
      ? ["Supporting context (optional, may be incomplete):", ...contextLines, ""]
      : []),
    "Diff:",
    input.diff,
  ].join("\n");
}

function stripMarkdownJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return trimmed;
}

function parseModelJson(raw: string): unknown {
  const normalized = stripMarkdownJsonFences(raw);
  try {
    return JSON.parse(normalized);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse model output as JSON: ${message}`);
  }
}

function normalizeNullableNotes(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const result = { ...(value as Record<string, unknown>) };
  if (result.testingNotes === null) {
    result.testingNotes = undefined;
  }
  if (result.riskNotes === null) {
    result.riskNotes = undefined;
  }

  return result;
}

export async function generatePRDescription(
  provider: AIProvider,
  input: PRDescriptionInputType
): Promise<PRDescriptionOutputType> {
  const parsedInput = PRDescriptionInput.parse(input);
  const prompt = buildPrompt(parsedInput);
  const rawResponse = await provider.generateText({
    systemPrompt: PR_DESCRIPTION_SYSTEM_PROMPT,
    prompt,
    temperature: 0.2,
  });

  const parsedJson = parseModelJson(rawResponse.trim());
  const normalizedOutput = normalizeNullableNotes(parsedJson);

  const validated = PRDescriptionOutput.safeParse(normalizedOutput);
  if (!validated.success) {
    throw new Error(
      `Model output failed PR description schema validation: ${validated.error.message}`
    );
  }

  return validated.data;
}
