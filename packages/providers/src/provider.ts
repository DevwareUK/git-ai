export interface GenerateTextInput {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface AIProvider {
  generateText(input: GenerateTextInput): Promise<string>;
}
