import { z } from "zod";

export const DiffSummaryInput = z.object({
  diff: z.string().trim().min(1),
});

export type DiffSummaryInputType = z.infer<typeof DiffSummaryInput>;

const DiffSummaryItem = z.string().trim().min(1);

export const DiffSummaryOutput = z.object({
  summary: z.string().trim().min(1, "summary must be non-empty"),
  majorAreas: z
    .array(DiffSummaryItem)
    .min(1, "majorAreas must include at least one item"),
  riskAreas: z
    .array(DiffSummaryItem)
    .min(1, "riskAreas must include at least one item")
    .optional(),
});

export type DiffSummaryOutputType = z.infer<typeof DiffSummaryOutput>;
