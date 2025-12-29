---
name: git-workflow
description: Guidelines for version control, commit conventions, and repository management for the Unified Numis monorepo.
---

# Git Workflow Skill

This skill ensures consistent version control practices across the shared `numis` repository, which integrates both the frontend and backend.

## Repository Structure

- **Flattened Monorepo**: This project uses a flattened monorepo structure.
- **Root Package**: The root `package.json` coordinates shared tasks, installations, and deployment builds.

## Commit Conventions

- **Descriptive Messages**: Use prefixes to indicate the scope of changes:
  - `deploy:` Changes related to Heroku, Procfile, or environment config.
  - `docs:` Updates to Markdown files or skill documentation.
- **Atomic Commits**: Keep commits focused on a single logical change.

## Branching & Remotes

- **Main Branch**: The `main` branch is the primary development branch.
- **GitHub**: Keep the `origin` remote pointing to the GitHub repository and update it whenever Heroku is updated.
- **Heroku Remote**: The repository is linked to the Heroku production app (`numis-db`).
  - Remote name: `heroku`
  - Deployment command: `git push heroku main`

## Deployment Flow

1.  Verify changes locally.
2.  Commit changes to the `main` branch.
3.  Deploy to production by pushing to the `heroku` remote.
4.  Monitor build progress and startup logs via `heroku logs --tail`.

## Prohibited Actions

- **MANDATORY APPROVAL**: NEVER commit code or push to a remote (including `heroku`) without explicit approval from the USER.
- **DO NOT Re-add Submodules**: Heroku has authentication issues with GitHub submodules. The repository MUST remain "flat" with `numis-be` and `numis-fe` as standard directories.
- **Avoid Committing .env Files**:
  - **Rule**: All variations of `.env` files MUST be ignored. This includes `.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`, `.env.docker`, and any file matching `*.env*`.
  - **Scope**: This applies to the root directory, `numis-be/`, `numis-fe/`, and any other subdirectories.
  - **Verification**: Run `git status` or `git check-ignore -v .env` to ensure files are correctly ignored before every commit.
- **No Large Binaries**: Use the `numis-be/temp` directory or external image hosting (BunnyCDN) instead of tracking large images (>1MB) in Git.
- **No Hardcoded Secrets**: Secrets (API keys, DB URLs, JWT secrets) must NEVER be committed to code. They must be loaded from environment variables.

## Pre-Commit Checklist

Before requesting approval to commit, verify the following:

1.  [ ] No `.env` files are staged (`git status`).
2.  [ ] No hardcoded secrets (API keys, passwords) are present in the diff.
3.  [ ] Commit message follows the standard prefix convention (`be:`, `fe:`, `deploy:`, `docs:`).
4.  [ ] Changes have been tested locally.
5.  [ ] No `.git` folders or `.gitmodules` files exist inside `numis-be` or `numis-fe`.
6.  [ ] Linting passes (if applicable).

## Example Requests

- "Commit the latest security hardening changes and push to Heroku."
- "Check if there are any uncommitted files in the backend directory."
- "Revert the last commit to the frontend components."
- "Sync the local repository with the remote origin."
- "Explain why we avoid git submodules in this project."
