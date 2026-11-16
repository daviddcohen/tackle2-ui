#!/usr/bin/env python3
"""Install local privacy hooks into one worktree without pushing or publishing."""

from pathlib import Path
import shutil
import subprocess
import sys

from hook import STAGING_REMOTE, repo_urls, verify_private

HOOKS = (
    'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg',
    'post-commit', 'applypatch-msg', 'pre-applypatch', 'post-applypatch',
    'pre-rebase', 'post-rewrite', 'post-checkout', 'post-merge', 'pre-push',
)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()

    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

    staging = subprocess.run(
        ['git', '-C', str(root), 'config', '--get', 'privateworkflow.stagingRepo'],
        capture_output=True, text=True,
    ).stdout.strip()
    if not staging:
        raise SystemExit('Set the private staging repository first: '
                         'git config privateworkflow.stagingRepo <owner>/<name>')
    if git('remote', 'get-url', STAGING_REMOTE) not in repo_urls(staging):
        raise SystemExit(f'Refusing to configure a clone whose {STAGING_REMOTE} remote is not {staging}')
    if git('remote', 'get-url', 'upstream') != 'https://github.com/konveyor/tackle2-ui.git':
        raise SystemExit('Refusing to configure an unexpected upstream')
    verify_private(staging, sole_owner=True)
    common = Path(git('rev-parse', '--path-format=absolute', '--git-common-dir'))
    hooks = common / 'private-workflow' / 'hooks'
    hooks.mkdir(parents=True, exist_ok=True)
    proxy = hooks / 'hook.py'
    shutil.copy2(Path(__file__).with_name('hook.py'), proxy)
    proxy.chmod(0o755)
    for name in HOOKS:
        path = hooks / name
        if path.is_symlink() and path.readlink() == Path('hook.py'):
            continue
        if path.exists() or path.is_symlink():
            raise SystemExit(f'Refusing to replace existing hook: {path}')
        path.symlink_to('hook.py')

    # Worktree config takes precedence over Husky's shared local config, so
    # npm ci can reinstall Husky without replacing the effective privacy hooks.
    git('config', '--local', 'extensions.worktreeConfig', 'true')
    git('config', '--worktree', 'core.hooksPath', str(hooks))
    git('remote', 'set-url', '--push', 'upstream', '/dev/null')
    git('config', 'remote.pushDefault', STAGING_REMOTE)
    git('config', 'push.default', 'current')
    print(f'Installed hooks for {root}; private staging: {staging}')
    print('Existing .husky hooks are delegated. No push or remote write performed.')


if __name__ == '__main__':
    main()
