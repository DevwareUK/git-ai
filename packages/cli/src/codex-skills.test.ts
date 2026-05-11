import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PRS_CODEX_SKILLS,
  installManagedCodexSkills,
  renderCodexSkillMarkdown,
  resolveCodexSkillsRoot,
} from "./codex-skills";

const cleanupTargets = new Set<string>();

afterEach(() => {
  for (const target of cleanupTargets) {
    rmSync(target, { recursive: true, force: true });
  }
  cleanupTargets.clear();
});

describe("managed prs Codex skills", () => {
  it("defines the expected workflow skills", () => {
    expect(PRS_CODEX_SKILLS.map((skill) => skill.name)).toEqual([
      "prs",
      "prs:start-issue-work",
      "prs:publish-audit",
      "prs:finish-work",
      "prs:parallel-batch",
    ]);
  });

  it("renders skill markdown with the GitHub audit contract", () => {
    const markdown = renderCodexSkillMarkdown(PRS_CODEX_SKILLS[1]);

    expect(markdown).toContain("name: prs:start-issue-work");
    expect(markdown).toContain("Use Superpowers for brainstorming, planning, worktrees, agents, and verification.");
    expect(markdown).toContain("Publish specs, plans, decisions, and completion notes to GitHub through `prs audit publish`.");
    expect(markdown).toContain("Never commit generated Superpowers specs or plans to `docs/superpowers`.");
  });

  it("renders the unified prs command router skill", () => {
    const markdown = renderCodexSkillMarkdown(PRS_CODEX_SKILLS[0]);

    expect(markdown).toContain("name: prs");
    expect(markdown).toContain("/prs issue");
    expect(markdown).toContain("/prs issue <number> finish");
    expect(markdown).toContain("/prs pr <number> resolve-conflicts");
    expect(markdown).toContain("actionable for me");
    expect(markdown).toContain("Existing managed skills are backing behaviors");
  });

  it("resolves CODEX_HOME before the user home fallback", () => {
    expect(resolveCodexSkillsRoot({ CODEX_HOME: "/tmp/codex-home" }, "/Users/tester")).toBe(
      "/tmp/codex-home/skills"
    );
    expect(resolveCodexSkillsRoot({}, "/Users/tester")).toBe("/Users/tester/.codex/skills");
  });

  it("installs managed skills under the Codex skills root", () => {
    const codexHome = mkdtempSync(resolve(tmpdir(), "prs-codex-home-"));
    cleanupTargets.add(codexHome);

    const result = installManagedCodexSkills({ CODEX_HOME: codexHome }, "/Users/tester");

    expect(result.installed).toBe(5);
    const unifiedSkillPath = resolve(codexHome, "skills", "prs", "SKILL.md");
    expect(existsSync(unifiedSkillPath)).toBe(true);
    expect(readFileSync(unifiedSkillPath, "utf8")).toContain("name: prs");
    const skillPath = resolve(codexHome, "skills", "prs-start-issue-work", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, "utf8")).toContain("name: prs:start-issue-work");
  });

  it("reports no slash command installation when no command root is configured", () => {
    const codexHome = mkdtempSync(resolve(tmpdir(), "prs-codex-home-"));
    cleanupTargets.add(codexHome);

    const result = installManagedCodexSkills({ CODEX_HOME: codexHome }, "/Users/tester");

    expect(result.installed).toBe(5);
    expect(result.skillFiles.some((file) => file.endsWith("/prs/SKILL.md"))).toBe(true);
  });
});
