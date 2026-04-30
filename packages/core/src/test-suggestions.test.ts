import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@prs/providers";
import {
  assessAddressedTestSuggestions,
  generateTestSuggestions,
} from "./test-suggestions";

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

describe("assessAddressedTestSuggestions", () => {
  it("asks the model to assess only unchecked suggestions against the current diff", async () => {
    const provider = createProvider({
      addressedSuggestions: [
        {
          suggestionId: "suggestion-1",
          addressed: true,
          evidence: "The diff adds tests/checkout-flow.test.ts for checkout completion.",
        },
      ],
    });

    const result = await assessAddressedTestSuggestions(provider, {
      diff: "diff --git a/tests/checkout-flow.test.ts b/tests/checkout-flow.test.ts\n+it('checks out')",
      prTitle: "Add checkout coverage",
      suggestions: [
        {
          suggestionId: "suggestion-1",
          area: "Verify checkout flow",
          addressed: false,
          priority: "high",
          testType: "integration",
          behavior: "Checkout completes successfully.",
          regressionRisk: "Checkout regressions could go unnoticed.",
          value: "It protects the primary purchase path.",
          implementationNote: "Add an integration test for checkout completion.",
        },
        {
          suggestionId: "suggestion-2",
          area: "Verify summary copy",
          addressed: true,
          priority: "medium",
          testType: "unit",
          behavior: "Summary copy renders.",
          regressionRisk: "Copy can regress.",
          value: "It protects support workflows.",
          implementationNote: "Add a rendering test.",
        },
      ],
    });

    const request = provider.generateText.mock.calls[0]?.[0];
    expect(request?.prompt).toContain("Determine whether existing unchecked AI test suggestions");
    expect(request?.prompt).toContain("suggestion-1");
    expect(request?.prompt).toContain("Verify checkout flow");
    expect(request?.prompt).not.toContain("suggestion-2");
    expect(request?.prompt).toContain("diff --git a/tests/checkout-flow.test.ts");
    expect(result.addressedSuggestions).toEqual([
      {
        suggestionId: "suggestion-1",
        addressed: true,
        evidence: "The diff adds tests/checkout-flow.test.ts for checkout completion.",
      },
    ]);
  });

  it("filters model-addressed IDs that were not requested", async () => {
    const provider = createProvider({
      addressedSuggestions: [
        {
          suggestionId: "suggestion-1",
          addressed: true,
          evidence: "The diff adds a focused checkout test.",
        },
        {
          suggestionId: "suggestion-99",
          addressed: true,
          evidence: "Not part of the unchecked request.",
        },
      ],
    });

    const result = await assessAddressedTestSuggestions(provider, {
      diff: "diff --git a/tests/checkout-flow.test.ts b/tests/checkout-flow.test.ts\n+it('checks out')",
      suggestions: [
        {
          suggestionId: "suggestion-1",
          area: "Verify checkout flow",
          addressed: false,
          priority: "high",
          testType: "integration",
          behavior: "Checkout completes successfully.",
          regressionRisk: "Checkout regressions could go unnoticed.",
          value: "It protects the primary purchase path.",
          implementationNote: "Add an integration test for checkout completion.",
        },
      ],
    });

    expect(result.addressedSuggestions).toEqual([
      {
        suggestionId: "suggestion-1",
        addressed: true,
        evidence: "The diff adds a focused checkout test.",
      },
    ]);
  });
});
