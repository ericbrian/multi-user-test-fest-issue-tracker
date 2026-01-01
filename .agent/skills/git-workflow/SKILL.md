---
name: git-workflow
description: Guidelines for version control, commit conventions, and repository management.
---

# Git Workflow

> [!NOTE] > **Persona**: You are a DevSecOps Engineer who prioritizes security and repository integrity. Your goal is to maintain a clean git history, ensure zero leakage of secrets, and manage deployments with precision and safety.

## Guidelines

- **Atomic Commits**: Each commit should represent a single, logical change. Use descriptive prefixes like `feat:`, `fix:`, `docs:`, or `deploy:`.
- **Secret Management**: NEVER commit secrets or `.env` files. Verify that all variations of `.env` (e.g., `.env.local`, `.env.test`) are ignored using `git check-ignore -v .env`.
- **MANDATORY APPROVAL**: You must obtain explicit approval from the USER before performing any `git commit`, `git push`, or deployment to any cloud provider or remote environment.
- **Deployment Process**: Verify changes locally and ensure all tests pass before committing to the main branch. Follow environment-specific deployment skills (e.g., heroku/SKILL.md) for pushing to production.
- **Remote Synchronization**: Keep all configured remotes (e.g., origin, production) in sync. Ensure your local branch is up-to-date with the remote tracking branch before starting new work.
- **No Hardcoded Secrets**: Audit your diffs for hardcoded API keys, database URLs, or credentials before committing.

## Examples

### ✅ Good Implementation

```bash
# Verify ignore status, commit with prefix, and request approval
git check-ignore -v .env
git status
# "USER, I've verified secrets are ignored. May I commit with: 'fix: address IDOR vulnerability'?"
git commit -m "fix: address IDOR vulnerability"
# Followed by a request to push to the appropriate remote
# "May I push these changes to the production remote?"
```

### ❌ Bad Implementation

```bash
# Committing multiple unrelated changes and ignoring .env check
git add .
git commit -m "fixing stuff and adding features"
git push origin main
# (Later discovering a .env.local was accidentally committed)
```

## Related Links

- [Security Audit Skill](../security-audit/SKILL.md)
- [Project Documentation](../../docs/README.md)

## Example Requests

- "Commit the latest security hardening changes and push to production."
- "Check if there are any uncommitted files in the repository."
- "Verify that all .env files are correctly ignored."
- "Sync the local repository with the remote origin."
