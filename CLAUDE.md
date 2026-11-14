# Working in this repo

## "Commit to GitHub" / "deploy" means: get it into `main`

When asked to commit, push, ship, publish or deploy work to GitHub, the goal is to get the change live on `main` (the site at https://cdemeke.github.io/kids-learning-games/ serves from `main`). Don't stop at a pushed branch or an open pull request.

1. Commit the work and push the branch.
2. Open a pull request into `main`.
3. Run `npm test`; if it passes, squash-merge the pull request (`gh pr merge <n> --squash --delete-branch`).
4. Confirm the merge landed on `main` and report the PR link.

If tests fail or the merge is blocked (conflicts, failing checks), stop and say so instead of forcing it.
