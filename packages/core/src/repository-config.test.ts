import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPOSITORY_AI_CONTEXT_EXCLUDE_PATHS,
  DEFAULT_REPOSITORY_AI_PROVIDER_TYPE,
  DEFAULT_REPOSITORY_AI_RUNTIME_TYPE,
  resolveRepositoryConfig,
} from "./repository-config";

describe("resolveRepositoryConfig", () => {
  it("adds default AI context exclusions and merges repository patterns", () => {
    const resolved = resolveRepositoryConfig({
      aiContext: {
        excludePaths: ["web/themes/**/css/**", "*.map"],
      },
      baseBranch: "develop",
    });

    expect(resolved.baseBranch).toBe("develop");
    expect(resolved.ai).toEqual({
      runtime: { type: DEFAULT_REPOSITORY_AI_RUNTIME_TYPE },
      provider: { type: DEFAULT_REPOSITORY_AI_PROVIDER_TYPE },
    });
    expect(resolved.aiContext.excludePaths).toEqual([
      ...DEFAULT_REPOSITORY_AI_CONTEXT_EXCLUDE_PATHS,
      "web/themes/**/css/**",
    ]);
  });

  it("preserves configured ai runtime and provider options", () => {
    const resolved = resolveRepositoryConfig({
      ai: {
        runtime: {
          type: "claude-code",
        },
        provider: {
          type: "bedrock-claude",
          model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
          region: "eu-west-1",
        },
      },
    });

    expect(resolved.ai).toEqual({
      runtime: {
        type: "claude-code",
      },
      provider: {
        type: "bedrock-claude",
        model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
        region: "eu-west-1",
      },
    });
  });
});
