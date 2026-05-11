import type { AuditTarget, RepositoryComment, RepositoryForge } from "./forge";

export const AUDIT_COMMENT_MARKER = "<!-- prs:audit -->";

export type AuditSection = {
  name: string;
  content: string;
};

export type PublishAuditArtifactInput = {
  target: AuditTarget;
  sectionName: string;
  content: string;
  localRun?: string;
};

export type PublishAuditArtifactResult = {
  status: "created" | "updated";
  comment: RepositoryComment;
};

function targetTitle(target: AuditTarget): string {
  return target.type === "issue"
    ? `Issue #${target.number} audit`
    : `Pull request #${target.number} audit`;
}

function sectionMarker(name: string, position: "start" | "end"): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `<!-- prs:audit:${normalized}:${position} -->`;
}

export function renderAuditCommentBody(input: {
  title: string;
  sections: AuditSection[];
  localRun?: string;
}): string {
  const lines = [AUDIT_COMMENT_MARKER, "", `# ${input.title}`, ""];

  if (input.localRun) {
    lines.push(`Local run: \`${input.localRun}\``, "");
  }

  for (const section of input.sections) {
    lines.push(sectionMarker(section.name, "start"));
    lines.push(`## ${section.name}`);
    lines.push("");
    lines.push(section.content.trim());
    lines.push(sectionMarker(section.name, "end"));
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function replaceOrAppendSection(body: string, section: AuditSection): string {
  const start = sectionMarker(section.name, "start");
  const end = sectionMarker(section.name, "end");
  const replacement = [start, `## ${section.name}`, "", section.content.trim(), end].join("\n");
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);

  if (pattern.test(body)) {
    return `${body.replace(pattern, replacement).trim()}\n`;
  }

  return `${body.trim()}\n\n${replacement}\n`;
}

export async function publishAuditArtifact(
  forge: RepositoryForge,
  input: PublishAuditArtifactInput
): Promise<PublishAuditArtifactResult> {
  if (!forge.isAuthenticated()) {
    throw new Error("GitHub authentication is required to publish prs audit artifacts.");
  }

  const existing = await forge.fetchAuditComment(input.target);
  const section = { name: input.sectionName, content: input.content };

  if (!existing) {
    const body = renderAuditCommentBody({
      title: targetTitle(input.target),
      sections: [section],
      localRun: input.localRun,
    });
    return {
      status: "created",
      comment: await forge.createAuditComment(input.target, body),
    };
  }

  return {
    status: "updated",
    comment: await forge.updateIssueComment(
      existing.id,
      replaceOrAppendSection(existing.body, section)
    ),
  };
}
