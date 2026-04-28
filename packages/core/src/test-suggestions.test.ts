import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@prs/providers";
import { generateTestSuggestions } from "./test-suggestions";

function createProvider(response: unknown): AIProvider & {
  generateText: ReturnType<typeof vi.fn>;
} {
  return {
    generateText: vi.fn().mockResolvedValue(JSON.stringify(response)),
  };
}

describe("generateTestSuggestions", () => {
  it("includes resolved suggestion context in the prompt", async () => {
    const provider = createProvider({
      summary: "One new gap remains.",
      suggestedTests: [
        {
          area: "Support actions",
          priority: "medium",
          testType: "integration",
          behavior: "Verify support actions still render for eligible orders.",
          regressionRisk: "The action list could disappear.",
          value: "Protects the support workflow.",
          protectedPaths: ["packages/core/src/test-suggestions.ts"],
          likelyLocations: ["packages/core/src/test-suggestions.test.ts"],
          implementationNote: "Add an integration test for support actions.",
        },
      ],
    });

    await generateTestSuggestions(provider, {
      diff: "diff --git a/file.ts b/file.ts\n+changed",
      resolvedSuggestions: [
        {
          area: "Template Rendering",
          testType: "integration",
          behavior: "Verify that the order detail template renders expected fields.",
          protectedPaths: ["web/themes/custom/bos/templates/commerce-order--user.html.twig"],
          likelyLocations: ["web/themes/custom/bos/src/userOrderDetailPage.test.ts"],
          resolvedAt: "2026-04-28T14:20:00.000Z",
          commitSha: "abc123",
        },
      ],
    });

    const request = provider.generateText.mock.calls[0]?.[0];
    expect(request?.prompt).toContain("Previously addressed test suggestions");
    expect(request?.prompt).toContain("Template Rendering");
    expect(request?.prompt).toContain("abc123");
    expect(request?.prompt).toContain("Do not repeat already addressed test work");
  });

  it("filters suggestions that exactly match active resolved suggestion keys", async () => {
    const provider = createProvider({
      summary: "The model repeated resolved work.",
      suggestedTests: [
        {
          area: "Template Rendering",
          priority: "high",
          testType: "integration",
          behavior: "Verify that the order detail template renders expected fields.",
          regressionRisk: "Template changes could hide order details.",
          value: "Protects the customer order detail page.",
          protectedPaths: [
            "web/themes/custom/bos/templates/commerce-order--user.html.twig",
          ],
          likelyLocations: ["web/themes/custom/bos/src/userOrderDetailPage.test.ts"],
          implementationNote: "Add a template contract test for expected fields.",
        },
      ],
    });

    const suggestions = await generateTestSuggestions(provider, {
      diff: "diff --git a/file.ts b/file.ts\n+changed",
      resolvedSuggestions: [
        {
          area: "Template Rendering",
          testType: "integration",
          behavior: "Verify that the order detail template renders expected fields.",
          protectedPaths: [
            "web/themes/custom/bos/templates/commerce-order--user.html.twig",
          ],
          likelyLocations: ["web/themes/custom/bos/src/userOrderDetailPage.test.ts"],
          resolvedAt: "2026-04-28T14:20:00.000Z",
          commitSha: "abc123",
        },
      ],
    });

    expect(suggestions).toEqual({
      summary: "No new unresolved AI test suggestions were found for the current PR diff.",
      suggestedTests: [],
    });
  });
});
