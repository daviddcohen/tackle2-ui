# Private tackle2-ui development

Prototype work is synced to a personal private staging repository on GitHub. It
keeps the public history of https://github.com/konveyor/tackle2-ui, but it is a
standalone repository, not a fork, because GitHub does not allow private forks of
public repositories: https://docs.github.com/en/pull-requests/reference/forks#visibility-of-forks.
Its name is kept in local git config only (`privateworkflow.stagingRepo`), never
in tracked files.

## Remotes and branches

| Remote     | Points at                                 | Push                   |
| ---------- | ----------------------------------------- | ---------------------- |
| `staging`  | the private staging repository            | yes, guarded (default) |
| `upstream` | `konveyor/tackle2-ui` (source of truth)   | disabled (`/dev/null`) |
| `fork`     | your public fork of `konveyor/tackle2-ui` | blocked in this clone  |

- `main` mirrors `upstream/main`.
- `design/agentic-prototype-v2` is the agentic prototype replayed onto current
  upstream main. It is the working branch and the staging default branch.
- `design/agentic-prototype` is the earlier snapshot, kept for reference.

The design branches replace substantial upstream code and are not intended to be
submitted as one PR.

## Setting up a clone

```sh
git remote add staging https://github.com/<owner>/<staging-repo>.git
git remote add upstream https://github.com/konveyor/tackle2-ui.git
git config privateworkflow.stagingRepo <owner>/<staging-repo>
git config privateworkflow.requiredEmail <work-email>   # optional identity guardrail
python3 -B scripts/private-development/install.py .
python3 -B scripts/private-development/test_hook.py
```

Run the installer once per worktree; pass the worktree directory as the
argument. Git hooks are not transferred by cloning. The installer uses
worktree-specific configuration so npm's Husky setup cannot replace the
effective hook path, and it delegates to the existing `.husky` hooks (including
the pre-commit checks). It also disables pushes to `upstream` and makes
`staging` the default push remote.

## What the hooks enforce

- **Pushes:** one branch update at a time, only to the `staging` remote, and only
  when its URL matches `privateworkflow.stagingRepo`. Before each push the hook
  checks live on GitHub that the repository is private, not a fork, has Actions
  disabled, and has no collaborator besides its owner. API or authentication
  failures block the push. Tags, branch deletions, multiple branch updates, and
  every other remote (including `upstream` and the public `fork`) are blocked.
- **Identity:** when `privateworkflow.requiredEmail` is set, commits whose author
  or committer email differs are rejected, and so are pushes containing any
  commit (not already upstream) with a different email.

These are local safeguards against mistakes, not access controls: anyone with
local access can bypass or modify Git hooks. GitHub Actions stays disabled on the
staging repository, and no deployment credentials or secrets are stored there.

## Reviewing the prototype locally

Use Node.js 22.22 or later (Node 24 recommended):

```sh
npm ci
npm run build -w common
MOCK=stub AUTH_REQUIRED=false npm run start:dev -w client -- --port 7010 --host 127.0.0.1
```

Open http://127.0.0.1:7010. This is a local review environment with mock data and
simulated agentic behavior; it does not establish real Hub or controller
support. It listens on loopback only.

## Upstream contributions

Make upstream PRs from a separate clone of your public fork, never from this
clone, and cut every branch from `upstream/main`. Only branches cut from
`upstream/main` should ever be pushed to the fork:

```sh
git clone https://github.com/<you>/tackle2-ui.git tackle2-ui-upstream
cd tackle2-ui-upstream
git remote add upstream https://github.com/konveyor/tackle2-ui.git
git fetch upstream
git switch -c <topic> upstream/main
# Re-implement one focused, reviewed change; do not cherry-pick prototype commits wholesale.
git commit -s -m ':sparkles: <summary>'
git push -u origin HEAD
```

Commits need a DCO sign-off (`-s`). When an AI tool helped, add an
`Assisted-by: <tool>:<model>` trailer instead of a `Co-Authored-By` line. PR titles
use upstream's gitmoji text aliases (for example `:bug:`, `:sparkles:`).

Maintainers decide whether to merge an upstream PR. Merging upstream does not by
itself establish inclusion in an MTA release.
