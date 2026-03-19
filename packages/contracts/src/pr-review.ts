import { z } from "zod";

const PRReviewComment = z.object({
  path: z.string().trim().min(1, "path must be non-empty"),
  line: z.number().int().positive("line must be a positive integer"),
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum([
    "bug",
    "correctness",
    "security",
    "performance",
    "maintainability",
    "testing",
  ]),
  body: z.string().trim().min(1, "body must be non-empty"),
  suggestion: z.string().trim().min(1).optional(),
});

export const PRReviewInput = z.object({
  diff: z.string().trim().min(1),
  prTitle: z.string().trim().min(1).optional(),
  prBody: z.string().trim().min(1).optional(),
  issueNumber: z.number().int().positive().optional(),
  issueTitle: z.string().trim().min(1).optional(),
  issueBody: z.string().trim().min(1).optional(),
  issueUrl: z.string().trim().url().optional(),
});

export type PRReviewInputType = z.infer<typeof PRReviewInput>;

export const PRReviewOutput = z.object({
  summary: z.string().trim().min(1, "summary must be non-empty"),
  comments: z.array(PRReviewComment),
});

export type PRReviewOutputType = z.infer<typeof PRReviewOutput>;
