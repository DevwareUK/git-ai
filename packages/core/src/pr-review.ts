import {
  PRReviewInput,
  PRReviewInputType,
  PRReviewOutput,
  PRReviewOutputType,
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

const PR_REVIEW_SYSTEM_PROMPT = [
  "You are a senior software engineer reviewing a GitHub pull request.",
  "Produce a concise overall review summary and a small set of high-signal inline review comments.",
  ...DIFF_GROUNDED_SYSTEM_PROMPT_LINES,
  "Use linked issue context when it is provided so you can check whether the change matches the requested behavior.",
  "Focus on correctness, maintainability, performance, security, and testing concerns.",
  "Avoid style nits, formatting feedback, and speculative comments.",
  "Only emit inline comments when the diff strongly supports an actionable concern.",
  "Each inline comment must point at a changed file path and a right-side line number from the diff.",
  "Prefer zero comments over weak comments.",
].join(" ");

function buildPrompt(input: PRReviewInputType): string {
  const contextLines: string[] = [];
  if (input.prTitle) {
    contextLines.push(`PR Title: ${input.prTitle}`);
  }
  if (input.prBody) {
    contextLines.push(`PR Body: ${input.prBody}`);
  }
  if (input.issueNumber !== undefined) {
    contextLines.push(`Linked Issue Number: ${input.issueNumber}`);
  }
  if (input.issueTitle) {
    contextLines.push(`Linked Issue Title: ${input.issueTitle}`);
  }
  if (input.issueBody) {
    contextLines.push(`Linked Issue Body: ${input.issueBody}`);
  }
  if (input.issueUrl) {
    contextLines.push(`Linked Issue URL: ${input.issueUrl}`);
  }

  return buildDiffTaskPrompt({
    taskLine:
      "Generate an AI pull request review from the provided diff.",
    guidanceLines: [
      'The "summary" should be a short paragraph describing the overall review outcome and how the change aligns with the diff context.',
      'The "comments" array should contain 0 to 8 actionable inline comments.',
      'Each comment must use a "path" that appears in the diff.',
      'Each comment "line" must be the right-side line number for an added or modified line in the diff.',
      'Use "severity" to communicate review priority.',
      'Use "category" to classify the concern.',
      'The comment "body" should explain the specific concern and why it matters.',
      'Include "suggestion" only when you can concisely describe a better implementation.',
      "When the linked issue context matters, mention requirement alignment in the summary or comments.",
      "Return an empty comments array when there are no strong line-level concerns.",
    ],
    schemaLines: [
      '  "summary": string,',
      '  "comments": [',
      "    {",
      '      "path": string,',
      '      "line": number,',
      '      "severity": "high" | "medium" | "low",',
      '      "category": "bug" | "correctness" | "security" | "performance" | "maintainability" | "testing",',
      '      "body": string,',
      '      "suggestion"?: string',
      "    }",
      "  ]",
    ],
    contextLines:
      contextLines.length > 0
        ? ["Supporting context (optional, may be incomplete):", ...contextLines]
        : undefined,
    diff: input.diff,
  });
}

function normalizeModelOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const result = normalizeNullableFields(value, []);
  if (!result || typeof result !== "object") {
    return result;
  }

  const normalized = { ...(result as Record<string, unknown>) };
  if (Array.isArray(normalized.comments)) {
    normalized.comments = normalized.comments.map((comment) =>
      normalizeNullableFields(comment, ["suggestion"])
    );
  }

  return normalized;
}

export async function generatePRReview(
  provider: AIProvider,
  input: PRReviewInputType
): Promise<PRReviewOutputType> {
  const parsedInput = PRReviewInput.parse(input);
  const prompt = buildPrompt(parsedInput);

  return generateStructuredOutput({
    provider,
    systemPrompt: PR_REVIEW_SYSTEM_PROMPT,
    prompt,
    schema: PRReviewOutput,
    validationErrorPrefix: "Model output failed PR review schema validation",
    normalizeParsedJson: normalizeModelOutput,
  });
}
