import { AIProvider, GenerateTextInput } from "./provider";

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OpenAIProviderOptions) {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new Error("OpenAIProvider requires a non-empty apiKey");
    }

    this.apiKey = apiKey;
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async generateText(input: GenerateTextInput): Promise<string> {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      throw new Error("OpenAIProvider requires a non-empty prompt");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(input.systemPrompt
            ? [{ role: "system", content: input.systemPrompt }]
            : []),
          { role: "user", content: prompt },
        ],
        temperature: input.temperature,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI request failed with status ${response.status}: ${body}`
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content || content.length === 0) {
      throw new Error("OpenAI response did not include message content");
    }

    return content;
  }
}
