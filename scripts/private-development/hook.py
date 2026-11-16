#!/usr/bin/env python3
"""Delegate existing Husky hooks and check private push destinations live."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys

def repo_urls(repo):
    return {
        f'https://github.com/{repo}.git',
        f'https://github.com/{repo}',
        f'git@github.com:{repo}.git',
        f'ssh://git@github.com/{repo}.git',
    }


# The only push destination is a personal private staging repository,
# configured only in local git config (`git config privateworkflow.stagingRepo
# owner/name`) so its name never appears in tracked files. Pushes to it go
# through the `staging` remote.
STAGING_REMOTE = 'staging'


def staging_repo():
    result = subprocess.run(
        ['git', 'config', '--get', 'privateworkflow.stagingRepo'],
        capture_output=True, text=True,
    )
    value = result.stdout.strip()
    return value if result.returncode == 0 and value else None


def required_email():
    """Identity guardrail: `git config privateworkflow.requiredEmail <email>`
    makes every commit made or pushed from this clone use exactly that email
    (author and committer), so work and personal identities never mix."""
    result = subprocess.run(
        ['git', 'config', '--get', 'privateworkflow.requiredEmail'],
        capture_output=True, text=True,
    )
    value = result.stdout.strip().lower()
    return value if result.returncode == 0 and value else None


def ident_email(var):
    ident = subprocess.check_output(['git', 'var', var], text=True).strip()
    match = re.search(r'<([^>]*)>', ident)
    return match.group(1).strip().lower() if match else ''


def verify_commit_identity():
    required = required_email()
    if required is None:
        return
    for var in ('GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT'):
        email = ident_email(var)
        if email != required:
            raise RuntimeError(f'{var} email {email or "(none)"} is not the required {required}')


def verify_pushed_identities(local_sha):
    """Every commit being pushed that upstream does not already have must be
    authored and committed with the required email."""
    required = required_email()
    if required is None:
        return
    log = subprocess.check_output(
        ['git', 'log', '--format=%H %ae %ce', local_sha, '--not', '--remotes=upstream'],
        text=True,
    )
    for line in log.splitlines():
        sha, author, committer = line.split(' ', 2)
        if author.lower() != required or committer.lower() != required:
            raise RuntimeError(
                f'Commit {sha[:10]} is not authored/committed as {required} '
                f'({author} / {committer}); fix the identity before pushing'
            )


def github(path):
    result = subprocess.run(
        ['gh', 'api', '--hostname', 'github.com', path],
        capture_output=True, text=True, timeout=25,
    )
    if result.returncode:
        raise RuntimeError('GitHub lookup failed; privacy could not be verified')
    return json.loads(result.stdout)


def verify_private(repo, sole_owner=True):
    meta = github(f'repos/{repo}')
    if not (meta.get('full_name', '').lower() == repo.lower()
            and meta.get('private') is True
            and meta.get('visibility') == 'private'
            and meta.get('fork') is False):
        raise RuntimeError('Destination is not the expected private standalone repository')
    if github(f'repos/{repo}/actions/permissions').get('enabled') is not False:
        raise RuntimeError('GitHub Actions must remain disabled for this private setup')
    if sole_owner:
        owner = repo.split('/')[0].lower()
        logins = {c.get('login', '').lower() for c in github(f'repos/{repo}/collaborators')}
        if logins != {owner}:
            raise RuntimeError('Staging repository must have no collaborators besides its owner')


def verify_push(args, data):
    staging = staging_repo()
    if not (staging is not None and len(args) == 2 and args[0] == STAGING_REMOTE
            and args[1] in repo_urls(staging)):
        raise RuntimeError('Only the configured staging remote at the expected private GitHub repository may receive pushes')
    lines = [line.split() for line in data.decode().splitlines() if line.strip()]
    if len(lines) != 1:
        raise RuntimeError('Push one explicit branch at a time')
    update = lines[0]
    if len(update) != 4 or not update[2].startswith('refs/heads/'):
        raise RuntimeError('Only branch updates are allowed')
    if not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', update[1]) or set(update[1]) == {'0'}:
        raise RuntimeError('Branch deletions and invalid object IDs are blocked')
    verify_private(staging, sole_owner=True)
    verify_pushed_identities(update[1])
    return staging


def main():
    hook = Path(sys.argv[0]).name
    args = sys.argv[1:]
    data = sys.stdin.buffer.read() if hook == 'pre-push' else None
    if hook == 'pre-commit':
        try:
            verify_commit_identity()
        except Exception as error:
            print(f'Commit blocked by identity guardrail: {error}', file=sys.stderr)
            return 1
    if hook == 'pre-push':
        try:
            target = verify_push(args, data)
        except Exception as error:
            print(f'Private push blocked: {error}', file=sys.stderr)
            return 1
        print(f'Private push verified: {target}', file=sys.stderr)

    # Preserve repository hooks. HUSKY=0 can skip these but never the privacy check.
    root = Path(subprocess.check_output(
        ['git', 'rev-parse', '--show-toplevel'], text=True,
    ).strip())
    delegate = root / '.husky' / hook
    if delegate.is_file() and os.environ.get('HUSKY') != '0':
        env = os.environ.copy()
        env['PATH'] = str(root / 'node_modules' / '.bin') + os.pathsep + env.get('PATH', '')
        return subprocess.run(['sh', '-e', str(delegate), *args], input=data, env=env).returncode
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
