#!/usr/bin/env python3
"""Network-independent regression checks for scheduled deployments."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import refresh_site_data as refresh
import restore_cache
from validate_site_data import validate


class RefreshSafetyTests(unittest.TestCase):
    def test_source_outage_keeps_old_files_and_skips_deploy(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work) / "data"
            root.mkdir()
            (root / "marker.json").write_text('{"existing":true}', encoding="utf-8")
            github_output = Path(work) / "output"
            with patch.object(refresh, "ROOT", root), \
                 patch.object(refresh, "valid_snapshot", return_value=True), \
                 patch.object(refresh, "source_available", return_value=False), \
                 patch.object(refresh, "run") as run, \
                 patch.dict(os.environ, {"GITHUB_OUTPUT": str(github_output)}):
                refresh.main()
            run.assert_not_called()
            self.assertEqual(json.loads((root / "marker.json").read_text()), {"existing": True})
            self.assertIn("ready=false", github_output.read_text())

    def test_success_can_publish_without_fetching_static_map(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work) / "data"
            root.mkdir()
            github_output = Path(work) / "output"
            with patch.object(refresh, "ROOT", root), \
                 patch.object(refresh, "valid_snapshot", return_value=True), \
                 patch.object(refresh, "source_available", return_value=True), \
                 patch.object(refresh, "valid_map", return_value=True), \
                 patch.object(refresh, "validate"), \
                 patch.object(refresh, "run") as run, \
                 patch.dict(os.environ, {"GITHUB_OUTPUT": str(github_output)}):
                refresh.main()
            self.assertEqual(run.call_count, 2)
            self.assertIn("ready=true", github_output.read_text())

    def test_failed_partial_generation_is_rolled_back(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work) / "data"
            root.mkdir()
            old = root / "marker.json"
            old.write_text('{"existing":true}', encoding="utf-8")
            github_output = Path(work) / "output"

            def bad_generation(_):
                old.write_text('{"partial":true}', encoding="utf-8")
                raise OSError("temporary RSS outage")

            with patch.object(refresh, "ROOT", root), \
                 patch.object(refresh, "valid_snapshot", return_value=True), \
                 patch.object(refresh, "source_available", return_value=True), \
                 patch.object(refresh, "run", side_effect=bad_generation), \
                 patch.dict(os.environ, {"GITHUB_OUTPUT": str(github_output)}):
                refresh.main()
            self.assertEqual(json.loads(old.read_text()), {"existing": True})
            self.assertIn("ready=false", github_output.read_text())

    def test_rss_preflight_outage(self):
        with patch.object(refresh.urllib.request, "urlopen", side_effect=OSError("503")):
            self.assertFalse(refresh.source_available())

    def test_cached_json_avoids_http(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work) / "data"
            root.mkdir()
            (root / "world.json").write_text('{"countries":{}}', encoding="utf-8")
            with patch.object(restore_cache, "ROOT", root), \
                 patch.object(restore_cache, "urlopen") as urlopen:
                self.assertEqual(restore_cache.recover("world.json"),
                                 ("world.json", True, "cached"))
            urlopen.assert_not_called()

    def test_validation_rejects_incomplete_snapshot(self):
        with self.assertRaises((OSError, ValueError)):
            validate()


if __name__ == "__main__":
    unittest.main()
