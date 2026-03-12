import {
  CommitMessageInput,
  CommitMessageInputType,
  CommitMessageOutput,
  CommitMessageOutputType,
} from "@ai-actions/contracts";
import { AIProvider } from "@ai-actions/providers";

const COMMIT_MESSAGE_SYSTEM_PROMPT =
  [
    "You are a senior software engineer writing git commit messages.",
    "Be concise and accurate.",
    "Prefer Conventional Commit style when appropriate.",
    "Keep the title under 72 characters when possible.",
    "Include a short body only when it adds useful context.",
    "Do not hallucinate or invent missing context.",
    "Return valid JSON only.",
  ].join(" ");

function buildPrompt(input: CommitMessageInputType): string {
  return [
    "Generate a git commit message from the provided diff.",
    "Return strictly valid JSON in this exact shape:",
    "{",
    '  "title": string,',
    '  "body": string | null',
    "}",
    "",
    'The "title" should be a concise commit title.',
    "Prefer Conventional Commit style when appropriate.",
    "Keep the title under roughly 72 characters.",
    'Use "body" only if a short explanatory body is needed; otherwise return null.',
    "Do not wrap JSON in markdown fences.",
    "",
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

function normalizeNullableBody(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const result = { ...(value as Record<string, unknown>) };
  if (result.body === null) {
    result.body = undefined;
  }

  return result;
}

export async function generateCommitMessage(
  provider: AIProvider,
  diff: string
): Promise<CommitMessageOutputType> {
  const parsedInput = CommitMessageInput.parse({ diff });
  const prompt = buildPrompt(parsedInput);
  const rawResponse = await provider.generateText({
    systemPrompt: COMMIT_MESSAGE_SYSTEM_PROMPT,
    prompt,
    temperature: 0.2,
  });

  const parsedJson = parseModelJson(rawResponse.trim());
  const normalizedOutput = normalizeNullableBody(parsedJson);

  const validated = CommitMessageOutput.safeParse(normalizedOutput);
  if (!validated.success) {
    throw new Error(
      `Model output failed commit message schema validation: ${validated.error.message}`
    );
  }

  return validated.data;
}
