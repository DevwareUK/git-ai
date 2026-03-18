import { z } from "zod";

export const RepositoryForgeType = z.enum(["github", "none"]);

export const RepositoryForgeConfig = z.object({
  type: RepositoryForgeType.optional(),
});

export type RepositoryForgeConfigType = z.infer<typeof RepositoryForgeConfig>;

export const RepositoryConfigCommand = z
  .array(z.string().trim().min(1, "command segments must be non-empty"))
  .min(1, "command must contain at least one segment");

export const RepositoryConfig = z.object({
  baseBranch: z.string().trim().min(1, "baseBranch must be non-empty").optional(),
  buildCommand: RepositoryConfigCommand.optional(),
  forge: RepositoryForgeConfig.optional(),
});

export type RepositoryConfigType = z.infer<typeof RepositoryConfig>;

export const ResolvedRepositoryConfig = z.object({
  baseBranch: z.string().trim().min(1),
  buildCommand: RepositoryConfigCommand,
  forge: z.object({
    type: RepositoryForgeType,
  }),
});

export type ResolvedRepositoryConfigType = z.infer<typeof ResolvedRepositoryConfig>;
