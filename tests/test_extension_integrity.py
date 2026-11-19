"""Integrity and Manifest V3 compliance checks for ZeroFlash Blur extension."""

from __future__ import annotations

import json
import re
import struct
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = ROOT / "extension"


class ExtensionIntegrityTestCase(unittest.TestCase):
    def test_manifest_v3_and_minimum_permissions(self) -> None:
        manifest_path = EXT_DIR / "manifest.json"
        self.assertTrue(manifest_path.exists())
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest["manifest_version"], 3)
        self.assertLessEqual(len(manifest["description"]), 132)
        self.assertEqual(
            set(manifest["permissions"]), {"storage", "activeTab", "scripting"}
        )
        self.assertNotIn("host_permissions", manifest)
        self.assertIn("<all_urls>", manifest.get("optional_host_permissions", []))

        # Verify referenced files exist
        self.assertTrue((EXT_DIR / manifest["background"]["service_worker"]).is_file())
        self.assertTrue((EXT_DIR / manifest["action"]["default_popup"]).is_file())
        self.assertTrue((EXT_DIR / manifest["options_page"]).is_file())

        # Verify icons exist and match declared PNG dimensions
        for size_str, rel_path in manifest["icons"].items():
            icon_file = EXT_DIR / rel_path
            self.assertTrue(icon_file.is_file(), f"Missing icon {rel_path}")
            data = icon_file.read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", data[16:24])
            expected = int(size_str)
            self.assertEqual((width, height), (expected, expected))

    def test_extension_html_mv3_csp_and_assets(self) -> None:
        html_files = list(EXT_DIR.rglob("*.html"))
        self.assertGreaterEqual(len(html_files), 2)

        for html_file in html_files:
            content = html_file.read_text(encoding="utf-8")
            # MV3 forbids inline <script> blocks and inline on* attributes
            self.assertIsNone(
                re.search(r"<script(?![^>]*\bsrc=)[^>]*>", content, re.I),
                f"Inline script found in {html_file}",
            )
            self.assertIsNone(
                re.search(r"\son[a-z]+\s*=", content, re.I),
                f"Inline event handler found in {html_file}",
            )

            for attr in re.findall(r'(?:src|href)="([^"]+)"', content):
                if attr.startswith(("http://", "https://", "#")):
                    continue
                target = (html_file.parent / attr.split("#")[0]).resolve()
                self.assertTrue(
                    target.is_file(),
                    f"Broken asset reference '{attr}' in {html_file}",
                )

    def test_package_zip_contains_manifest_at_root(self) -> None:
        import sys

        sys.path.insert(0, str(ROOT / "scripts"))
        import package_extension

        package_extension.main()
        manifest = json.loads((EXT_DIR / "manifest.json").read_text(encoding="utf-8"))
        zip_path = ROOT / "dist" / f"zeroflash-blur-v{manifest['version']}.zip"
        self.assertTrue(zip_path.is_file())

        with zipfile.ZipFile(zip_path, "r") as zf:
            names = set(zf.namelist())
            self.assertIn("manifest.json", names)
            self.assertIn("background/service_worker.js", names)
            self.assertIn("content/content.js", names)
            self.assertIn("popup/popup.html", names)

    def test_free_edition_has_no_localhost_or_paywall_remnants(self) -> None:
        forbidden = ("localhost:8787", "/api/v1/licenses", "Unlock Pro")
        for ext_file in list(EXT_DIR.rglob("*.js")) + list(EXT_DIR.rglob("*.html")):
            text = ext_file.read_text(encoding="utf-8")
            for marker in forbidden:
                self.assertNotIn(
                    marker,
                    text,
                    f"Unexpected paid/localhost marker '{marker}' found in {ext_file}",
                )


if __name__ == "__main__":
    unittest.main()
