import { describe, expect, it } from "vitest";
import type { RepositoryForge, RepositoryComment } from "./forge";
import {
  AUDIT_COMMENT_MARKER,
  publishAuditArtifact,
  renderAuditCommentBody,
} from "./audit-artifacts";

function comment(body: string): RepositoryComment {
  return {
    id: 7,
    body,
    url: "https://github.test/comment/7",
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    author: "prs[bot]",
    isBot: true,
  };
}

describe("audit artifacts", () => {
  it("renders a managed audit comment with a stable marker and section", () => {
    const body = renderAuditCommentBody({
      title: "Issue #42 audit",
      sections: [{ name: "Spec", content: "# Spec\n\nApproved." }],
      localRun: ".prs/runs/example",
    });

    expect(body).toContain(AUDIT_COMMENT_MARKER);
    expect(body).toContain("## Spec");
    expect(body).toContain("# Spec\n\nApproved.");
    expect(body).toContain("Local run: `.prs/runs/example`");
  });

  it("creates a new issue audit comment when none exists", async () => {
    const calls: string[] = [];
    const forge = {
      type: "github",
      isAuthenticated: () => true,
      fetchAuditComment: async () => undefined,
      createAuditComment: async (_target, body) => {
        calls.push(body);
        return comment(body);
      },
    } as unknown as RepositoryForge;

    const result = await publishAuditArtifact(forge, {
      target: { type: "issue", number: 42 },
      sectionName: "Plan",
      content: "Plan body",
      localRun: ".prs/runs/example",
    });

    expect(result.status).toBe("created");
    expect(calls[0]).toContain("## Plan");
  });

  it("updates an existing issue audit comment by replacing the named section", async () => {
    const existing = renderAuditCommentBody({
      title: "Issue #42 audit",
      sections: [{ name: "Plan", content: "Old plan" }],
      localRun: ".prs/runs/example",
    });
    let updatedBody = "";
    const forge = {
      type: "github",
      isAuthenticated: () => true,
      fetchAuditComment: async () => comment(existing),
      updateIssueComment: async (_commentId, body) => {
        updatedBody = body;
        return comment(body);
      },
    } as unknown as RepositoryForge;

    const result = await publishAuditArtifact(forge, {
      target: { type: "issue", number: 42 },
      sectionName: "Plan",
      content: "New plan",
      localRun: ".prs/runs/example",
    });

    expect(result.status).toBe("updated");
    expect(updatedBody).toContain("New plan");
    expect(updatedBody).not.toContain("Old plan");
  });
});
