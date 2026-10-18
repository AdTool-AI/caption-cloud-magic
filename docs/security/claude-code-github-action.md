# Claude Code GitHub Action

Workflow: `.github/workflows/claude.yml` (uses `anthropics/claude-code-action@v1`).

The workflow does nothing until it is on `main` **and** a credential secret exists.
Issue and comment events always run the workflow file from the default branch, so
having it on a feature branch or in an open PR does not activate it.

## When Claude runs

Only on explicit opt-in:

| Event | Condition |
| --- | --- |
| Issue opened | Title or body contains `@claude`, author is OWNER / MEMBER / COLLABORATOR |
| Issue labeled | Label `claude` is applied (only people with triage+ can label) |
| Issue / PR comment, PR review, review comment | Text contains `@claude`, author is OWNER / MEMBER / COLLABORATOR |

On top of that, the action itself refuses to run for any actor without **write**
permission on the repo, and for every bot (`allowed_bots: ''`). Issues created by
ChatGPT's GitHub connector under a collaborator's own account pass; issues created
by a bot or app account do not.

## Authentication setup (manual, by a repo admin)

1. **Claude GitHub App** – must be installed on `AdTool-AI/caption-cloud-magic`
   (https://github.com/apps/claude). The action exchanges the job's OIDC token
   (`id-token: write`) for an App token; that token is what writes comments,
   branches and PRs. The job's own `GITHUB_TOKEN` is read-only.
2. **One repository secret** under Settings → Secrets and variables → Actions:
   - `CLAUDE_CODE_OAUTH_TOKEN` – uses a Claude Pro/Max subscription; create it
     locally with `claude setup-token`, **or**
   - `ANTHROPIC_API_KEY` – an API key from console.anthropic.com (billed per use;
     set a spend limit on the workspace).

   Set exactly one. Never commit either value.

## Security implications

- **Write access via the App.** Claude can push branches and open PRs with the
  Claude App's permissions. `main` is currently unprotected, so nothing in GitHub
  prevents a push to `main`; the action works on `claude/…` branches, but a branch
  protection rule on `main` (require PR + review) is the real safeguard. Remember
  that merging to `main` deploys staging via Jenkins.
- **Prompt injection.** Issue text, comments and repo files become part of the
  prompt. Only trusted collaborators can trigger a run, but the content Claude
  reads (e.g. a pasted log, a linked issue) can still contain instructions. Review
  every Claude PR like any other contribution.
- **Secrets in the runner.** Only the Anthropic credential and the App token are
  present. `persist-credentials: false` keeps the checkout token out of git config.
  No Supabase, AWS or Jenkins secrets are passed to this job — keep it that way.
- **Cost.** Each run consumes subscription quota or API credits; `--max-turns 30`,
  a 30-minute timeout and one-run-per-issue concurrency cap a single run.

## Testing safely

1. Merge only after review (Rakesh) and approval (Samuel). Merging does not
   trigger Claude by itself.
2. Add the secret.
3. Open a throwaway issue, e.g. "@claude Explain what `src/lib/agentStatus.ts`
   does. Do not change any files." Expect a single Claude comment, no branch.
4. Check the run under Actions → Claude Code; confirm a comment from someone
   without write access (or a bot) is skipped.
5. Then try a small code task on an issue and confirm Claude opens a branch/PR
   for review instead of touching `main`.

To disable quickly: delete the secret, or disable the "Claude Code" workflow in
the Actions tab.
