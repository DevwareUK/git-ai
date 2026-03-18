import {
  RepositoryConfig,
  type RepositoryConfigType,
  ResolvedRepositoryConfig,
  type ResolvedRepositoryConfigType,
} from "@git-ai/contracts";

export const DEFAULT_REPOSITORY_BASE_BRANCH = "main";
export const DEFAULT_REPOSITORY_BUILD_COMMAND = ["pnpm", "build"] as const;
export const DEFAULT_REPOSITORY_FORGE_TYPE = "github" as const;

export function resolveRepositoryConfig(
  config?: RepositoryConfigType
): ResolvedRepositoryConfigType {
  const parsedConfig = RepositoryConfig.parse(config ?? {});

  return ResolvedRepositoryConfig.parse({
    baseBranch: parsedConfig.baseBranch ?? DEFAULT_REPOSITORY_BASE_BRANCH,
    buildCommand: parsedConfig.buildCommand ?? [...DEFAULT_REPOSITORY_BUILD_COMMAND],
    forge: {
      type: parsedConfig.forge?.type ?? DEFAULT_REPOSITORY_FORGE_TYPE,
    },
  });
}
