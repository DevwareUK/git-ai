import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import { AIProvider, GenerateTextInput } from "./provider";

export interface BedrockClaudeProviderOptions {
  model: string;
  region: string;
  credentials?: AwsCredentialIdentityProvider;
  client?: BedrockRuntimeClient;
}

function readBedrockResponseText(response: ConverseCommandOutput): string | undefined {
  const content = response.output?.message?.content ?? [];
  const text = content
    .flatMap((block) => ("text" in block && block.text ? [block.text.trim()] : []))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || undefined;
}

export class BedrockClaudeProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;

  constructor(options: BedrockClaudeProviderOptions) {
    const model = options.model?.trim();
    if (!model) {
      throw new Error("BedrockClaudeProvider requires a non-empty model");
    }

    const region = options.region?.trim();
    if (!region) {
      throw new Error("BedrockClaudeProvider requires a non-empty region");
    }

    this.model = model;
    this.client =
      options.client ??
      new BedrockRuntimeClient({
        region,
        credentials: options.credentials,
      });
  }

  async generateText(input: GenerateTextInput): Promise<string> {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      throw new Error("BedrockClaudeProvider requires a non-empty prompt");
    }

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.model,
        system: input.systemPrompt
          ? [
              {
                text: input.systemPrompt,
              },
            ]
          : undefined,
        messages: [
          {
            role: "user",
            content: [
              {
                text: prompt,
              },
            ],
          },
        ],
        inferenceConfig:
          input.temperature === undefined
            ? undefined
            : {
                temperature: input.temperature,
              },
      })
    );

    const content = readBedrockResponseText(response);
    if (!content) {
      throw new Error("Bedrock Claude response did not include message content");
    }

    return content;
  }
}
