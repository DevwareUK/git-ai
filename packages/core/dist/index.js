"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  generatePRDescription: () => generatePRDescription
});
module.exports = __toCommonJS(index_exports);

// src/pr-description.ts
var import_contracts = require("@ai-actions/contracts");
var PR_DESCRIPTION_SYSTEM_PROMPT = [
  "You are a senior software engineer writing a GitHub pull request description.",
  "Be concise but informative.",
  "Focus on the intent and meaningful impact of the change, not every tiny diff line.",
  "Do not hallucinate or invent missing context.",
  "If uncertain, omit claims rather than guessing.",
  "Return valid JSON only."
].join(" ");
function buildPrompt(input) {
  const contextLines = [];
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
    "",
    "Do not wrap JSON in markdown fences.",
    "",
    ...contextLines.length > 0 ? ["Supporting context (optional, may be incomplete):", ...contextLines, ""] : [],
    "Diff:",
    input.diff
  ].join("\n");
}
function stripMarkdownJsonFences(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  return trimmed;
}
function parseModelJson(raw) {
  const normalized = stripMarkdownJsonFences(raw);
  try {
    return JSON.parse(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse model output as JSON: ${message}`);
  }
}
function normalizeNullableNotes(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  const result = { ...value };
  if (result.testingNotes === null) {
    result.testingNotes = void 0;
  }
  if (result.riskNotes === null) {
    result.riskNotes = void 0;
  }
  return result;
}
async function generatePRDescription(provider, input) {
  const parsedInput = import_contracts.PRDescriptionInput.parse(input);
  const prompt = buildPrompt(parsedInput);
  const rawResponse = await provider.generateText({
    systemPrompt: PR_DESCRIPTION_SYSTEM_PROMPT,
    prompt,
    temperature: 0.2
  });
  const parsedJson = parseModelJson(rawResponse.trim());
  const normalizedOutput = normalizeNullableNotes(parsedJson);
  const validated = import_contracts.PRDescriptionOutput.safeParse(normalizedOutput);
  if (!validated.success) {
    throw new Error(
      `Model output failed PR description schema validation: ${validated.error.message}`
    );
  }
  return validated.data;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generatePRDescription
});
