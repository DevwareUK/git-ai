# prs

`prs` is a GitHub-first AI workflow layer for teams that want better pull request throughput before they trust broader repository automation.

The primary offer is intentionally narrow:

- review pull requests with better context
- update pull requests without overwriting human-written guidance
- fix selected review feedback inside the live PR branch
- surface missing tests before quality drifts

Starting here gives a new team faster proof of value with lower runtime risk, fewer permissions, and less process change than full issue-to-PR automation on day one.

Advanced issue-to-PR automation still exists, but it is not the recommended entry point for new teams because it asks for broader runtime trust, more GitHub permissions, and more process discipline on day one.

GitHub-only by design:

- `prs` currently targets GitHub repositories and GitHub pull request workflows on purpose
- the launch goal is a strong GitHub offer first, not thin parity across every forge

Recommended launch path today:

- forge: GitHub
- structured-text provider: OpenAI
- interactive runtime: Codex

`bedrock-claude` and `claude-code` remain supported for advanced customization, but they are not the default first-offer path and some workflows remain intentionally asymmetric.

`prs` is the canonical CLI name. The legacy `git-ai` command still works during the migration window, but it now prints a deprecation warning before continuing.

## Primary offer

Start here if you are evaluating `prs` for a team:

| Surface | Why it is part of the primary offer |
| --- | --- |
| `actions/pr-review` | Adds AI pull request pre-review signal, higher-level findings, and line-linked review comments in GitHub. Generated setup workflows mark inline comments with hidden PRS metadata so local fix flows can recognize PRS-authored findings. |
| `actions/pr-assistant` | Maintains a managed PR assistant section in the pull request body without overwriting unrelated manual content. |
| `actions/test-suggestions` | Posts practical, task-ready test suggestions for the current pull request diff in GitHub. |
| `prs review` | Runs a local top-risk diff pre-review that surfaces the strongest reviewer-ready concerns before or during a pull request. |
| `prs pr fix-comments <pr-number>` | Pulls selected GitHub review comments into a focused local fix flow, ignoring resolved/outdated threads and suppressing already-addressed PRS-authored bot findings after successful fix runs. |
| `prs pr fix-failing-tests <pr-number>` | Captures currently failing local verification output on a PR branch and hands it to the configured runtime for a focused fix. |
| `prs pr fix-tests <pr-number>` | Pulls selected managed AI test suggestions into a focused local implementation flow with preserved task context. |
| `prs test-backlog` | Finds the highest-value automated testing gaps in the repository. |

Use [docs/launch-demo.md](docs/launch-demo.md) when you need a buyer-facing walkthrough of this first-offer path.

## Recommended workflows

These are the fastest paths to a useful first result:

1. Review a pull request better: use `actions/pr-review` in GitHub or run `prs review --base origin/main` locally.
2. Respond to live PR feedback: run `prs pr fix-comments <pr-number>`, `prs pr fix-failing-tests <pr-number>`, or `prs pr fix-tests <pr-number>` when the PR branch is checked out locally.
3. Raise test confidence: use `actions/test-suggestions` on pull requests and `prs test-backlog --top 5` for repository-wide gaps.

Add `actions/pr-assistant` when you also want managed PR-body updates that preserve human-written context.

## Quick start

Install the CLI from this repository:

```bash
cd /path/to/prs
pnpm install
pnpm --filter @prs/cli build
cd packages/cli
pnpm link --global
```

Configure a target repository:

```bash
cd /path/to/your-repo
prs setup
```

After upgrading the CLI, refresh the managed Codex `/prs` skills without rerunning repository setup:

```bash
prs update skills
```

For the recommended OpenAI provider path, create a `.env` file in the target repository with `OPENAI_API_KEY`. `OPENAI_MODEL` and `OPENAI_BASE_URL` are optional. GitHub-backed local workflows can use `GH_TOKEN`/`GITHUB_TOKEN`, but normal developer and Codex shells can also use an authenticated `gh`; if that binary is outside PATH, set `forge.githubCliPath` in `.prs/config.json` or `PRS_GH_PATH` in the shell.

Then try the safest local CLI workflows:

```bash
prs review
prs test-backlog --top 5
```

If you already have a live GitHub pull request branch checked out locally, try:

```bash
prs pr fix-comments 88
prs pr fix-failing-tests 88
prs pr fix-tests 88
```

See [docs/setup-configuration.md](docs/setup-configuration.md) for prerequisites, `prs setup`, `.env`, `.prs/config.json`, provider/runtime fallback, and `.prs/` working-state details.

## Command tiers

Run `prs help` or `prs --help` for the same tiered overview in the terminal.

Primary offer commands:

- `prs review`
- `prs pr fix-comments <pr-number>`
- `prs pr fix-failing-tests <pr-number>`
- `prs pr fix-tests <pr-number>`
- `prs test-backlog`

Advanced commands:

- `prs issue draft --draft-file <path>`
- `prs issue refine <number>`
- `prs issue plan <number> [--refresh]`
- `prs issue <number>`
- `prs issue prepare <number>`
- `prs issue finalize <number>`

Beta commands:

- `prs issue <number> <number> ...`
- `prs issue batch <number> <number> [...number]`
- `prs pr resolve-conflicts <pr-number>`
- `prs feature-backlog`

Supporting commands:

- `prs setup`
- `prs setup --update-skills`
- `prs update skills`
- `prs audit publish (--issue <number>|--pr <number>) --file <path> --section <name> [--local-run <path>]`
- `prs codex issue <number>`
- `prs codex issue batch <number> <number> [...number] [--mode unattended]`
- `prs codex pr prepare-review <pr-number>`
- `prs codex pr resolve-conflicts <pr-number>`
- `prs tool issue list [--actionable] --json`
- `prs tool issue ready <issue-number> [--all] --json`
- `prs tool issue create (--draft-file <path>|--issue-set <path>) --json`
- `prs tool pr list [--actionable] --json`
- `prs tool pr ready <pr-number> [--all] --json`
- `prs tool pr prepare-review <pr-number> --json`
- `prs commit`
- `prs diff`

`prs tool pr ready <pr-number> --json` is the fast local PR-readiness path used by `/prs:pr`: it checks out the actual PR head branch, fetches and merges the latest PR base branch, writes readiness metadata with GitHub-hosted context such as failed/pending checks, managed AI test suggestions, actionable review comments, and grouped comment summaries with source links, and does not run the configured build or broad local verification. Review comment readiness uses the same resolved/outdated thread filtering as `prs pr fix-comments`. Add `--all` when you also want the configured local runtime started when possible.

Detailed command behavior lives in [docs/cli-reference.md](docs/cli-reference.md). Codex and `/prs` operator guidance lives in [docs/codex-prs-workflows.md](docs/codex-prs-workflows.md).

## Documentation map

| Document | Use it for |
| --- | --- |
| [docs/setup-configuration.md](docs/setup-configuration.md) | Installation, `prs setup`, `.env`, `.prs/config.json`, runtime/provider fallback, and `.prs/` state. |
| [docs/cli-reference.md](docs/cli-reference.md) | Full CLI command reference, flags, examples, important behavior, and workflow command details. |
| [docs/codex-prs-workflows.md](docs/codex-prs-workflows.md) | Codex runtime expectations, Superpowers-backed issue planning, unattended issue automation, and `/prs` operator usage. |
| [docs/launch-demo.md](docs/launch-demo.md) | Buyer-facing demo order and trust-boundary story for the first-offer workflows. |
| [docs/development.md](docs/development.md) | Monorepo layout, package scripts, GitHub Action local entrypoints, testing, and CI expectations. |

## Development

This is a pnpm workspace. The main checks are:

```bash
pnpm build
pnpm test
pnpm lint
```

Contributor command details, package-level scripts, local action entrypoints, and CI workflow notes are in [docs/development.md](docs/development.md).
