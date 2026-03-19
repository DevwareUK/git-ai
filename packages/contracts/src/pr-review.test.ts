import { describe, expect, it } from "vitest";
import { PRReviewOutput } from "./pr-review";

describe("PRReviewOutput", () => {
  it("parses a valid PR review payload", () => {
    const parsed = PRReviewOutput.parse({
      summary: "The PR mostly lines up with the linked issue, but one guard path needs attention.",
      comments: [
        {
          path: "packages/cli/src/index.ts",
          line: 42,
          severity: "high",
          category: "correctness",
          body: "This branch skips the issue lookup when the flag is provided without a value.",
          suggestion: "Fail fast when --issue-number is present without a numeric argument.",
        },
      ],
    });

    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0]?.path).toBe("packages/cli/src/index.ts");
  });

  it("rejects empty required fields", () => {
    expect(() =>
      PRReviewOutput.parse({
        summary: "   ",
        comments: [],
      })
    ).toThrow();
  });
});
