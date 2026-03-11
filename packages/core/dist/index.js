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
var PR_DESCRIPTION_SYSTEM_PROMPT = "You write clear, accurate GitHub pull request titles and descriptions.";
function buildPrompt(input) {
  return [
    "Generate a GitHub pull request title and body from the diff.",
    "Return strictly valid JSON with keys: title, body, testingNotes, riskNotes.",
    "title and body are required strings. testingNotes and riskNotes are optional strings.",
    "Do not include markdown code fences.",
    "",
    `Issue Title: ${input.issueTitle ?? ""}`,
    `Issue Body: ${input.issueBody ?? ""}`,
    "",
    "Diff:",
    input.diff
  ].join("\n");
}
function extractJson(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match?.[1]) {
      return JSON.parse(match[1]);
    }
    throw new Error("Model output was not valid JSON");
  }
}
async function generatePRDescription(provider, input) {
  const parsedInput = import_contracts.PRDescriptionInput.parse(input);
  const prompt = buildPrompt(parsedInput);
  const rawResponse = await provider.generateText({
    systemPrompt: PR_DESCRIPTION_SYSTEM_PROMPT,
    prompt,
    temperature: 0.2
  });
  const parsedOutput = extractJson(rawResponse);
  return import_contracts.PRDescriptionOutput.parse(parsedOutput);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generatePRDescription
});
