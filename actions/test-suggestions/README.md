# test-suggestions action

Generate practical PR-level test suggestions from a pull request diff via OpenAI.

This GitHub Action is OpenAI-only today. Advanced local CLI provider and runtime customization such as `bedrock-claude` or `claude-code` does not change this action's input surface.

On the first run, pass a PR diff and no existing managed comment. The action generates a managed checklist comment where each suggestion has an unchecked `- [ ] Addressed` task line.

On later runs, pass `existing_comment` or `existing_comment_file`. The action parses that managed comment, preserves the original suggestion text and any checked boxes, asks the model only whether unchecked suggestions are now addressed by test-related changes in the current diff, and checks newly addressed boxes. It does not invent replacement suggestions in this mode.

## Local test

1. Install and build workspace packages:

```bash
pnpm install
pnpm build
```

2. Write the diff to a file and run the action entry locally:

```bash
git diff -- . ':!pnpm-lock.yaml' > /tmp/prs-test-suggestions.diff

INPUT_DIFF_FILE="/tmp/prs-test-suggestions.diff" \
INPUT_PR_TITLE="Example PR title" \
INPUT_OPENAI_API_KEY="<your-key>" \
INPUT_OPENAI_MODEL="gpt-4o-mini" \
node actions/test-suggestions/dist/index.js
```

`INPUT_DIFF` is still supported for smaller local runs, but `INPUT_DIFF_FILE` avoids shell and GitHub Actions argument-length limits.
`INPUT_EXISTING_COMMENT` or `INPUT_EXISTING_COMMENT_FILE` switches the action into checklist assessment mode. In that mode, checked boxes are monotonic: checked suggestions stay checked, including boxes checked manually in GitHub.
`INPUT_RESOLVED_SUGGESTIONS` remains available as a legacy manual input for callers that already keep separate resolved-suggestion JSON, but generated workflows use the existing managed comment instead.

When `GITHUB_OUTPUT` is not set, outputs are printed to stdout as `summary=...` and `body=...`.
