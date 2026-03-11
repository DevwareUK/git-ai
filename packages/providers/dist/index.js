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
  OpenAIProvider: () => OpenAIProvider
});
module.exports = __toCommonJS(index_exports);

// src/openai.ts
var OpenAIProvider = class {
  apiKey;
  model;
  baseUrl;
  constructor(options) {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new Error("OpenAIProvider requires a non-empty apiKey");
    }
    this.apiKey = apiKey;
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }
  async generateText(input) {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      throw new Error("OpenAIProvider requires a non-empty prompt");
    }
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : [],
          { role: "user", content: prompt }
        ],
        temperature: input.temperature
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI request failed with status ${response.status}: ${body}`
      );
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content.length === 0) {
      throw new Error("OpenAI response did not include message content");
    }
    return content;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OpenAIProvider
});
