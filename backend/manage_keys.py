"""CLI helper to create, list, and revoke ZeroFlash Blur Pro license keys."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from db import LicenseStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage ZeroFlash Pro license keys")
    parser.add_argument(
        "--db",
        default=os.environ.get("ZF_DB_PATH") or str(BACKEND_DIR / "data" / "licenses.db"),
        help="Path to SQLite database",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="Generate a new Pro license key")
    p_create.add_argument("--email", default="", help="Customer email")
    p_create.add_argument("--max-devices", type=int, default=5, help="Max devices allowed")
    p_create.add_argument("--provider", default="manual", help="Payment source label")

    sub.add_parser("list", help="List all license keys and active devices")

    p_revoke = sub.add_parser("revoke", help="Revoke a license key")
    p_revoke.add_argument("license_key", help="License key to revoke")

    args = parser.parse_args()
    store = LicenseStore(args.db)
    try:
        if args.command == "create":
            lic = store.create_license(
                customer_email=args.email or None,
                max_devices=args.max_devices,
                provider=args.provider,
            )
            print(f"Created key: {lic['license_key']}")
            print(f"Email:       {lic['customer_email'] or '-'}")
            print(f"Max devices: {lic['max_devices']}")
        elif args.command == "list":
            rows = store.list_licenses()
            if not rows:
                print("No licenses found.")
            for row in rows:
                print(
                    f"{row['license_key']} | {row['status']} | "
                    f"devices {row['devices_used']}/{row['max_devices']} | "
                    f"{row['provider']} | {row['customer_email'] or '-'}"
                )
        elif args.command == "revoke":
            cnt = store.revoke_license(license_key=args.license_key)
            print(f"Revoked {cnt} license(s).")
    finally:
        store.close()


if __name__ == "__main__":
    main()
