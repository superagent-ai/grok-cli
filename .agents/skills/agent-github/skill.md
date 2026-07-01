---
name: agent-github
description: Use the built-in `GitHub` sub-agent with `agent-github` for repository operations on public GitHub repos. Apply when a task needs cloning, forking, branching, committing changes, pushing to forks, and creating Pull Requests.
---

# agent-github

Use this skill when the task involves contributing to public GitHub repositories through the standard fork + PR workflow.

This project uses `agent-github` for all GitHub and git interactions. Prefer the built-in `GitHub` sub-agent and associated git tools over raw shell commands where possible for reliability, safety, and proper credential handling.

## When to use it

- The user wants to make code changes, bug fixes, feature additions, documentation updates, refactoring, or any other contribution to a public open-source repository on GitHub.
- Tasks that require creating atomic commits and opening well-formed Pull Requests (with title, body, labels, assignees, reviewers, etc.).
- Forking repositories, managing feature branches, pushing changes to the user’s own fork, and handling the full PR lifecycle (creation, status checks, comments, updates, and closing).
- Any scenario where the agent must interact with a public GitHub repo in a safe, auditable, and reversible way.

## Requirements

- Git installed and properly configured in the environment (user.name, user.email, and credential helper set up).
- GitHub CLI (`gh`) available **or** a GitHub Personal Access Token (PAT) with at least the `public_repo` and `workflow` scopes (minimal permissions needed for forking public repos, pushing to personal forks, and creating PRs).
- The authenticated GitHub account must be able to fork public repositories.
- The target repository must be public (private, internal, or archived repos are explicitly out of scope for this agent).
- Network access to github.com and api.github.com.

## Preferred flow

1. Delegate to `task` with `agent: "github"` unless the current agent already has the `github_*` / `git_*` tools and the task is tiny.
2. Use `github_get_repo` to inspect the target public repository (default branch, license, recent activity, fork status, and whether the user already has a fork).
3. Use `github_fork_repo` if the user does not already have a fork (standard safety practice).
4. Clone the user’s fork locally using `git_clone`.
5. Create a new, descriptively named feature branch with `git_create_branch`.
6. Make targeted file changes (via code-editing tools, direct file writes, or patch application).
7. Use `git_status` / `git_diff` to inspect changes, stage with `git_add`, and commit with `git_commit` (always using a conventional commit message).
8. Push the branch to the fork with `git_push`.
9. Create the Pull Request via `github_create_pr` with a clear title, detailed body (including “what”, “why”, “how”, and testing notes), appropriate labels, and linked issues.
10. After any state-changing operation, re-check repository/PR status (`github_get_repo` or `github_get_pr`) before continuing.

## Tool guidance

- `github_get_repo`: Primary observation tool – fetch repo metadata, default branch, open issues/PRs, fork status, and current state.
- `github_fork_repo`: Safely fork the public upstream repo to the authenticated user’s account.
- `git_clone`: Clone the user’s fork (or upstream when appropriate).
- `git_create_branch`: Create and switch to a new feature branch.
- `git_status` / `git_diff`: Inspect current changes before committing.
- `git_add`: Stage files for commit.
- `git_commit`: Commit staged changes with a required conventional commit message.
- `git_push`: Push the feature branch to the user’s fork (with upstream tracking).
- `github_create_pr`: Create the PR (title, body, draft flag, reviewers, labels, assignees, linked issues).
- `github_get_pr`: Check PR status, CI checks, reviews, mergeability, comments, and conflicts.
- `github_comment_on_pr`: Post comments or updates on an existing PR.
- `github_list_issues` / `github_search_code`: For context, linking issues, or finding related code.
- `github_update_pr`: Update an existing PR’s title, body, labels, or draft status.

## Reliability rules

- Always use the fork + PR model for public repositories (never attempt direct push to the upstream repo unless the user is explicitly confirmed as a maintainer with write access).
- Generate high-quality, conventional commit messages and comprehensive PR descriptions (include “what”, “why”, “how”, testing steps, and screenshots where relevant).
- Snapshot repository/PR state (`github_get_repo` or `github_get_pr`) before and after every write operation.
- Keep PRs focused and atomic (one logical change per PR when possible; use multiple PRs for larger features).
- Verify that changes pass basic linting/build/CI checks before finalizing the PR (or clearly document any known gaps in the PR body).
- Prefer reversible, low-risk changes unless the user explicitly requests something destructive.
- Include the user’s GitHub handle and any relevant context in the PR body for easy attribution and review.
- Use draft PRs for work-in-progress contributions.

## Blockers

Stop and report clearly if:

- Missing or insufficient GitHub authentication / PAT.
- GitHub rate limits are hit (API or secondary rate limits).
- Target repo is private, archived, has disabled forking, or is read-only.
- The requested change is overly broad, destructive, or would require maintainer-level access.
- CI/CD failures that cannot be resolved automatically and the user has not provided explicit guidance.
- Ambiguous change request from the user (e.g., no clear “what to change”, “which repo”, or “expected outcome”).
- `agent-github` or its native tools (`gh` CLI / git) are unavailable or misconfigured.
- The fork already exists but is in an unrecoverable state (e.g., corrupted local clone).

---

This completes the full `agent-github` skill specification, ready to drop into your agent system. It mirrors the exact style, depth, and safety-first philosophy of the provided `agent-desktop` example while being fully tailored for public GitHub contributions.
