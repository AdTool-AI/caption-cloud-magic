# Claude Code GitHub Action

Workflow: `.github/workflows/claude.yml`.

This workflow is disabled unless the repository Actions variable
`CLAUDE_ENABLED` is set to `true`. A credential secret alone does not enable it.
The workflow is interactive: an approved maintainer must explicitly invoke it.
It is not an automatic review of every pull request.

## Initial operator policy

Only the following GitHub usernames may invoke Claude in this initial rollout:

- `rjavahegde`
- `AdToolAI`

These are the maintainer identities named in PR #10. Confirm that they are the
intended Rakesh and Sam accounts before enabling. Display names and email
addresses are not interchangeable with GitHub usernames. If a username needs to
change, update both the job condition and the shell allowlist through a reviewed
PR. Other collaborators are deliberately excluded for now.

The job condition checks the repository, enable switch, human event sender,
operator username, and trigger. Before checking out code or invoking the Claude
action, an API preflight verifies that the actor is a human account and still
has repository `write` or `admin` permission. An API error or insufficient
permission fails closed. The action's own write-access and bot checks remain
enabled as a second layer.

| Event | Trigger |
| --- | --- |
| Issue opened | Title or body contains `@claude` |
| Issue labeled | The `claude` label is applied |
| Issue or PR comment created | Body contains `@claude` |
| PR review submitted | Review body contains `@claude` |
| PR review comment created | Comment body contains `@claude` |

Every row is subject to the operator and permission gates. For label events, the
authorized person is the actor applying the label, not the original issue author.
Editing an existing comment or issue does not trigger this workflow. Use a new
comment to make a new request.

## Before enabling

1. Obtain Rakesh's review and Sam's explicit approval for PR #10. Do not enable
   the assistant merely because ordinary frontend CI is green.
2. Protect `main` with a required PR, at least one independent approval, required
   E2E Smoke Suite checks, stale-approval dismissal, resolved review threads,
   and restrictions on force pushes and deletion. The Claude App must not bypass
   these controls. Protect workflow changes with code-owner review where practical.
3. Coordinate main protection with the existing Lovable editing flow. Direct
   pushes to main may be blocked; use reviewed PRs instead of giving the Claude
   App or a broad group a bypass. Merges to main can still trigger staging CI.
4. Keep the existing `v*` release-tag creation and immutability rules. Check that
   the Claude App cannot create, move or delete production release tags. The
   assistant must not obtain AWS or Jenkins production credentials.
5. Install the official Claude GitHub App on the intended repository only and
   review its granted permissions. The action exchanges the workflow's OIDC token
   for a short-lived App token. That App token can write comments and code even
   though the workflow's own `GITHUB_TOKEN` is read-only.
6. Confirm exactly one authentication method and its account owner, as below.
7. Keep `CLAUDE_ENABLED` unset or set to `false` while merging and preparing tests.

Branch protection, GitHub App installation, spending controls and tag rules are
repository/account settings. Replacing this YAML does not configure them.

## Authentication

Configure exactly one repository Actions secret:

- `CLAUDE_CODE_OAUTH_TOKEN`: an OAuth token for the intended Claude subscription,
  generated locally with `claude setup-token`. Confirm whose subscription and
  usage allowance it consumes.
- `ANTHROPIC_API_KEY`: a dedicated API key from the intended Anthropic workspace.
  Configure provider-side spending controls and notifications for that workspace.

The workflow rejects both missing credentials and simultaneous configuration of
both methods. Do not rotate or delete an existing secret until its owner and
other consumers have been checked. Never put secret values in Git, issue text,
PR comments or logs.

At the 19 October 2026 review, the repository already contained a secret named
`CLAUDE_CODE_OAUTH_TOKEN`; its value and validity were not inspected. Therefore,
the old statement that this PR is inactive until a secret is added is incorrect.
The explicit enable variable is the activation control in this replacement.

## Enabling and disabling

After the protection and authentication checks, open repository Settings > Secrets
and variables > Actions > Variables. Add the repository variable:

```text
Name:  CLAUDE_ENABLED
Value: true
```

Then create a new authorized test event. Previously skipped requests are not
automatically replayed. Never use a production deployment as a test request.

To disable new invocations, set `CLAUDE_ENABLED` to `false` or disable the Claude
Code workflow in the Actions tab. Also cancel any already running or queued
Claude jobs: changing a variable is not a kill switch for running jobs. Revoke
credentials or App access separately if compromise is suspected.

## Cost and execution limits

- Claude has a limit of 10 agentic turns and the job has a 15-minute timeout.
- One workflow concurrency group is used per issue or PR. Different issues can
  run in parallel. GitHub concurrency is not a global spending limit or a
  guaranteed first-in-first-out request queue.
- These controls limit execution, not money. OAuth runs use the subscription's
  allowance and applicable extra-usage settings; verify these with its owner.
- For API-key operation, configure workspace spending controls. After checking
  support in the pinned action/CLI, an additional client-side API estimate guard
  can be added as `--max-budget-usd 2.00` in `claude_args`. It is an estimated
  per-run guard, may overshoot, and is not a strict billing cap. Do not assume
  this flag limits OAuth subscription quota.
- Review usage after the first few requests before increasing turn/time limits.

## Security boundaries

- Both top-level actions are pinned to full commits from their official upstream
  repositories. Review updates before changing the pins. This does not make all
  transitive packages, downloaded components or repository content immutable.
- Only the selected Claude credential is passed as an application secret. No AWS,
  Jenkins or Supabase service-role credentials are passed to this job. The
  permission preflight receives only the read-only job token.
- `persist-credentials: false` prevents checkout from retaining its token in Git
  configuration. The Claude action can subsequently configure its own App-token
  Git access; this setting does not make the full job read-only.
- `allowed_bots` and `allowed_non_write_users` remain empty. Do not change either
  to `*`. Detailed execution output and the model-authored report are disabled.
- Trusted invocation does not make all context trusted. Claude reads repository
  files, issue text and comments that may contain prompt injection. Review every
  generated change, especially dependencies, workflows, authentication and billing.
- An instruction to use branches is not an access-control boundary. Enforced
  main protection and release-tag rules are the safeguards against bypassing the
  human review and production release process.

## Safe acceptance tests

1. Before enabling, confirm the new workflow is skipped even for an approved
   user's `@claude` comment. Ordinary application checks may still run separately.
2. After enabling, an approved user creates a throwaway issue such as:
   `@claude Explain src/lib/agentStatus.ts. Do not change any files.`
   Verify that the permission/auth preflights pass and Claude answers without
   committing code. Do not assume its internal branch setup is read-only.
3. Have an existing non-allowlisted user create an `@claude` comment. Confirm the
   Claude job is skipped. Do not grant a test stranger repository access.
4. Verify bot-originated events do not invoke the model. For the label path, test
   an approved maintainer applying `claude` to a throwaway issue; the issue author
   need not be an approved operator.
5. Request a small documentation change. Verify it goes through a branch/PR,
   ordinary CI and independent human review. Confirm protections prevent the App
   from bypassing main review and release-tag restrictions.
6. Inspect run logs for accidental disclosure and check subscription/API usage.
   Record the successful test and disable the workflow if unexpected writes,
   permission errors or spending occur.

## Pinned upstream revisions

Verified on 19 October 2026:

- `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` (v4 line).
- `anthropics/claude-code-action@5eb090f3c3afd701a0672cd32981197ca27688f6`
  (v1 line).

## References

- https://github.com/anthropics/claude-code-action/blob/5eb090f3c3afd701a0672cd32981197ca27688f6/docs/setup.md
- https://github.com/anthropics/claude-code-action/blob/5eb090f3c3afd701a0672cd32981197ca27688f6/docs/security.md
- https://docs.github.com/en/actions/reference/security/secure-use
- https://code.claude.com/docs/en/cli-reference
