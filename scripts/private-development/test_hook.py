"""Tests for mistakes that could expose private work through a push."""

import subprocess
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import hook

UPDATE = ('refs/heads/example ' + 'a' * 40 + ' refs/heads/example ' + '0' * 40 + '\n').encode()
STAGING = 'someone/staging-repo'
STAGING_ARGS = ['staging', f'https://github.com/{STAGING}.git']
STAGING_META = {'full_name': STAGING, 'private': True, 'visibility': 'private', 'fork': False}


class StagingPushTests(unittest.TestCase):
    def check(self, args=STAGING_ARGS, data=UPDATE, meta=None, collaborators=None, staging=STAGING):
        responses = [
            STAGING_META if meta is None else meta,
            {'enabled': False},
            [{'login': 'someone'}] if collaborators is None else collaborators,
        ]
        with patch.object(hook, 'staging_repo', return_value=staging), \
                patch.object(hook, 'required_email', return_value=None), \
                patch.object(hook, 'github', side_effect=responses):
            return hook.verify_push(args, data)

    def test_sole_owner_staging_allowed(self):
        self.assertEqual(self.check(), STAGING)

    def test_unconfigured_staging_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(staging=None)

    def test_staging_remote_url_must_match_config(self):
        with self.assertRaises(RuntimeError):
            self.check(args=['staging', 'https://github.com/other/repo.git'])

    def test_staging_with_collaborators_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(collaborators=[{'login': 'someone'}, {'login': 'teammate'}])

    def test_staging_fork_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(meta={**STAGING_META, 'fork': True})

    def test_origin_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(args=['origin', STAGING_ARGS[1]])

    def test_upstream_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(args=['upstream', 'https://github.com/konveyor/tackle2-ui.git'])

    def test_public_fork_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(args=['fork', 'https://github.com/someone/tackle2-ui.git'])

    def test_public_destination_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(meta={**STAGING_META, 'private': False, 'visibility': 'public'})

    def test_metadata_must_match_destination(self):
        with self.assertRaises(RuntimeError):
            self.check(meta={**STAGING_META, 'full_name': 'other/private'})

    def test_unverified_privacy_blocked(self):
        with patch.object(hook, 'staging_repo', return_value=STAGING), \
                patch.object(hook, 'github', side_effect=RuntimeError('offline')):
            with self.assertRaises(RuntimeError):
                hook.verify_push(STAGING_ARGS, UPDATE)

    def test_lookup_timeout_blocked(self):
        with patch.object(hook, 'staging_repo', return_value=STAGING), \
                patch.object(hook.subprocess, 'run', side_effect=subprocess.TimeoutExpired('gh', 25)):
            with self.assertRaises(subprocess.TimeoutExpired):
                hook.verify_push(STAGING_ARGS, UPDATE)

    def test_actions_must_remain_disabled(self):
        responses = [STAGING_META, {'enabled': True}, [{'login': 'someone'}]]
        with patch.object(hook, 'staging_repo', return_value=STAGING), \
                patch.object(hook, 'github', side_effect=responses):
            with self.assertRaises(RuntimeError):
                hook.verify_push(STAGING_ARGS, UPDATE)

    def test_multiple_branches_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(data=UPDATE + UPDATE)

    def test_tags_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(data=UPDATE.replace(b'refs/heads/', b'refs/tags/'))

    def test_deletions_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(data=UPDATE.replace(b'a' * 40, b'0' * 40))

    def test_empty_update_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(data=b'')

    def test_malformed_update_blocked(self):
        with self.assertRaises(RuntimeError):
            self.check(data=b'invalid\n')



class IdentityGuardrailTests(unittest.TestCase):
    def test_no_requirement_allows_anything(self):
        with patch.object(hook, 'required_email', return_value=None):
            hook.verify_commit_identity()
            hook.verify_pushed_identities('a' * 40)

    def test_commit_with_required_identity_allowed(self):
        with patch.object(hook, 'required_email', return_value='work@example.com'), \
                patch.object(hook, 'ident_email', return_value='work@example.com'):
            hook.verify_commit_identity()

    def test_commit_with_other_identity_blocked(self):
        with patch.object(hook, 'required_email', return_value='work@example.com'), \
                patch.object(hook, 'ident_email', return_value='personal@example.com'):
            with self.assertRaises(RuntimeError):
                hook.verify_commit_identity()

    def test_push_with_foreign_author_blocked(self):
        log = 'a' * 40 + ' personal@example.com work@example.com\n'
        with patch.object(hook, 'required_email', return_value='work@example.com'), \
                patch.object(hook.subprocess, 'check_output', return_value=log):
            with self.assertRaises(RuntimeError):
                hook.verify_pushed_identities('a' * 40)

    def test_push_with_required_identity_allowed(self):
        log = 'a' * 40 + ' Work@Example.com work@example.com\n'
        with patch.object(hook, 'required_email', return_value='work@example.com'), \
                patch.object(hook.subprocess, 'check_output', return_value=log):
            hook.verify_pushed_identities('a' * 40)


if __name__ == '__main__':
    unittest.main()
