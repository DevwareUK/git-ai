import { appendFileSync } from "node:fs";
import { TestSuggestionsInput } from "@prs/contracts";
import { generateTestSuggestions } from "@prs/core";
import { OpenAIProvider } from "@prs/providers";
import {
  getOptionalInput,
  getRequiredInlineOrFileInput,
  getRequiredInput,
} from "../../shared/src/inputs";
import { buildCommentBody } from "./comment";

function setOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log(`${name}=${value}`);
    return;
  }

  const delimiter = `EOF_${name.toUpperCase()}`;
  const payload = `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
  appendFileSync(outputPath, payload);
}

function parseOptionalJsonInput(name: string): unknown {
  const rawValue = getOptionalInput(name);
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON for ${name}: ${message}`);
  }
}

async function run(): Promise<void> {
  const input = TestSuggestionsInput.parse({
    diff: getRequiredInlineOrFileInput("diff", "diff_file"),
    prTitle: getOptionalInput("pr_title"),
    prBody: getOptionalInput("pr_body"),
    resolvedSuggestions: parseOptionalJsonInput("resolved_suggestions"),
  });

  const provider = new OpenAIProvider({
    apiKey: getRequiredInput("openai_api_key"),
    model: getOptionalInput("openai_model"),
    baseUrl: getOptionalInput("openai_base_url"),
  });

  const result = await generateTestSuggestions(provider, input);

  setOutput("summary", result.summary);
  setOutput("body", buildCommentBody(result));
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exitCode = 1;
});
