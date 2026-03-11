import { z } from "zod";

export const PRDescriptionInput = z.object({
  diff: z.string().trim().min(1),
  issueTitle: z.string().trim().min(1).optional(),
  issueBody: z.string().trim().min(1).optional(),
});

export type PRDescriptionInputType = z.infer<typeof PRDescriptionInput>;

export const PRDescriptionOutput = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  testingNotes: z.string().trim().min(1).optional(),
  riskNotes: z.string().trim().min(1).optional(),
});

export type PRDescriptionOutputType = z.infer<typeof PRDescriptionOutput>;
