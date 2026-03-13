interface BuildDiffTaskPromptOptions {
  taskLine: string;
  schemaLines: string[];
  guidanceLines?: string[];
  contextLines?: string[];
  diff: string;
}

export const DIFF_GROUNDED_SYSTEM_PROMPT_LINES = [
  "Focus on the intent and meaningful impact of the change, not every tiny diff line.",
  "Do not hallucinate or invent missing context.",
  "If uncertain, omit claims rather than guessing.",
  "Return valid JSON only.",
];

export function buildDiffTaskPrompt(
  options: BuildDiffTaskPromptOptions
): string {
  return [
    options.taskLine,
    "Explain the intent of the change at a high level.",
    "Focus on meaningful functional or architectural changes instead of line-by-line narration.",
    "Group related changes together when it improves clarity.",
    "If the diff does not support a claim, omit it.",
    ...(options.guidanceLines ?? []),
    "Return strictly valid JSON in this exact shape:",
    "{",
    ...options.schemaLines,
    "}",
    "",
    "Do not wrap JSON in markdown fences.",
    "",
    ...(options.contextLines?.length ? [...options.contextLines, ""] : []),
    "Diff:",
    options.diff,
  ].join("\n");
}
