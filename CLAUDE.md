# Working in this repo

## "Commit to GitHub" / "deploy" means: get it into `main`

When asked to commit, push, ship, publish or deploy work to GitHub, the goal is to get the change live on `main` (the site at https://cdemeke.github.io/kids-learning-games/ serves from `main`). Don't stop at a pushed branch or an open pull request.

1. Commit the work and push the branch.
2. Open a pull request into `main`.
3. Run `npm test`; if it passes, squash-merge the pull request (`gh pr merge <n> --squash --delete-branch`).
4. Confirm the merge landed on `main` and report the PR link.

If tests fail or the merge is blocked (conflicts, failing checks), stop and say so instead of forcing it.

## Include screenshots on large PRs (> 500 lines changed)

When creating a pull request with more than **500 lines** added or changed, include relevant screenshots of what was built or changed in the PR description:

1. Capture screenshots of the key visual states (for example: menu/setup screen, active gameplay or changed UI, and summary/modal views).
2. Save the PNGs under `docs/screenshots/<slug>/` (not bundled into the Electron app) and commit them to the PR branch.
3. Embed the screenshots inline in the PR description using the committed head SHA (`https://github.com/cdemeke/kids-learning-games/blob/<sha>/docs/screenshots/<slug>/<file>.png?raw=true`) so they render directly on GitHub.
