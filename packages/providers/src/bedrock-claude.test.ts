import { describe, expect, it, vi } from "vitest";
import { BedrockClaudeProvider } from "./bedrock-claude";

describe("BedrockClaudeProvider", () => {
  it("sends a converse request and returns the response text", async () => {
    const send = vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [
            {
              text: "Generated response",
            },
          ],
        },
      },
    });

    const provider = new BedrockClaudeProvider({
      model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      region: "eu-west-1",
      client: {
        send,
      } as never,
    });

    await expect(
      provider.generateText({
        prompt: "Summarize the diff",
        systemPrompt: "You are concise.",
        temperature: 0.2,
      })
    ).resolves.toBe("Generated response");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]?.input).toMatchObject({
      modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      system: [
        {
          text: "You are concise.",
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              text: "Summarize the diff",
            },
          ],
        },
      ],
      inferenceConfig: {
        temperature: 0.2,
      },
    });
  });

  it("fails clearly when the response does not include text content", async () => {
    const provider = new BedrockClaudeProvider({
      model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      region: "eu-west-1",
      client: {
        send: vi.fn().mockResolvedValue({
          output: {
            message: {
              content: [],
            },
          },
        }),
      } as never,
    });

    await expect(provider.generateText({ prompt: "Test" })).rejects.toThrow(
      "Bedrock Claude response did not include message content"
    );
  });
});
