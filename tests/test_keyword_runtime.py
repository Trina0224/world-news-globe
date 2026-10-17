"""Runs dependency-free JavaScript keyword tests in the existing offline suite."""
from pathlib import Path
import shutil
import subprocess
import unittest

class KeywordRuntimeTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node.js is needed for keyword runtime tests')
    def test_keyword_regressions(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(['node', '--test', 'tests/keyword.test.mjs'], cwd=root,
                                capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
