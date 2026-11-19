"""Package the Chrome extension cleanly for Chrome Web Store upload."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    ext_dir = root / "extension"
    manifest = json.loads((ext_dir / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]

    dist_dir = root / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dist_dir / f"zeroflash-blur-v{version}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(ext_dir.rglob("*")):
            if not file_path.is_file():
                continue
            if file_path.name.startswith(".") or file_path.name.endswith(".map"):
                continue
            rel = file_path.relative_to(ext_dir)
            zf.write(file_path, rel.as_posix())

    print(f"Packaged Chrome Web Store zip: {zip_path}")


if __name__ == "__main__":
    main()
