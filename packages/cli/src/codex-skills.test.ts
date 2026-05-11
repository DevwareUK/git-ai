import { describe, expect, it } from "vitest";
import {
  PRS_CODEX_SKILLS,
  renderCodexSkillMarkdown,
  resolveCodexSkillsRoot,
} from "./codex-skills";

describe("managed prs Codex skills", () => {
  it("defines the expected workflow skills", () => {
    expect(PRS_CODEX_SKILLS.map((skill) => skill.name)).toEqual([
      "prs:start-issue-work",
      "prs:publish-audit",
      "prs:finish-work",
      "prs:parallel-batch",
    ]);
  });

  it("renders skill markdown with the GitHub audit contract", () => {
    const markdown = renderCodexSkillMarkdown(PRS_CODEX_SKILLS[0]);

    expect(markdown).toContain("name: prs:start-issue-work");
    expect(markdown).toContain("Use Superpowers for brainstorming, planning, worktrees, agents, and verification.");
    expect(markdown).toContain("Publish specs, plans, decisions, and completion notes to GitHub through `prs audit publish`.");
    expect(markdown).toContain("Never commit generated Superpowers specs or plans to `docs/superpowers`.");
  });

  it("resolves CODEX_HOME before the user home fallback", () => {
    expect(resolveCodexSkillsRoot({ CODEX_HOME: "/tmp/codex-home" }, "/Users/tester")).toBe(
      "/tmp/codex-home/skills"
    );
    expect(resolveCodexSkillsRoot({}, "/Users/tester")).toBe("/Users/tester/.codex/skills");
  });
});
