---
name: git-workflow
description: Guidelines for version control, commit conventions, and repository management for the Unified Numis monorepo.
---

# Git Workflow Skill

This skill ensures consistent version control practices across the `test-fest-tracker` repository.

## Repository Structure

- **Standard Node.js Repo**: This project uses a standard flat structure.
- **Root Package**: The `package.json` manages all dependencies and scripts.

## Commit Conventions

- **Descriptive Messages**: Use prefixes to indicate the scope of changes:
  - `deploy:` Changes related to Heroku, Procfile, or environment config.
  - `docs:` Updates to Markdown files or skill documentation.
- **Atomic Commits**: Keep commits focused on a single logical change.

## Branching & Remotes

- **Main Branch**: The `main` branch is the primary development branch.
- **GitHub**: Keep the `origin` remote pointing to the GitHub repository and update it whenever Heroku is updated.
- **Heroku Remote**: The repository is linked to the Heroku production app.
  - Remote name: `heroku`
  - Deployment command: `git push heroku main`

## Deployment Flow

1.  Verify changes locally.
2.  Commit changes to the `main` branch.
3.  Deploy to production by pushing to the `heroku` remote.
4.  Monitor build progress and startup logs via `heroku logs --tail -a <app-name>`.

## Prohibited Actions

- **MANDATORY APPROVAL**: NEVER commit code or push to a remote (including `heroku`) without explicit approval from the USER.
- **Avoid Committing .env Files**:
  - **Rule**: All variations of `.env` files MUST be ignored. This includes `.env`, `.env.local`, `.env.test`, `.env.production` and any file matching `*.env*`.
  - **Verification**: Run `git status` or `git check-ignore -v .env` to ensure files are correctly ignored before every commit.
- **No Hardcoded Secrets**: Secrets (API keys, DB URLs, details) must NEVER be committed to code. They must be loaded from environment variables.

## Pre-Commit Checklist

Before requesting approval to commit, verify the following:

1.  [ ] No `.env` files are staged (`git status`).
2.  [ ] No hardcoded secrets (API keys, passwords) are present in the diff.
3.  [ ] Commit message follows the standard conventions.
4.  [ ] Changes have been tested locally.
5.  [ ] Linting passes (if applicable).

## Example Requests

- "Commit the latest security hardening changes and push to Heroku."
- "Check if there are any uncommitted files in the backend directory."
- "Revert the last commit to the frontend components."
- "Sync the local repository with the remote origin."
- "Explain why we avoid git submodules in this project."
