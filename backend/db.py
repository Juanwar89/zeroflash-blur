"""SQLite persistence layer for ZeroFlash Blur licenses and device activations."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from security import generate_license_key


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LicenseStore:
    """Thread-safe SQLite store for license keys and multi-device activations."""

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            timeout=10.0,
        )
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS licenses (
                    license_key TEXT PRIMARY KEY,
                    plan TEXT NOT NULL DEFAULT 'pro',
                    status TEXT NOT NULL DEFAULT 'active',
                    max_devices INTEGER NOT NULL DEFAULT 5,
                    customer_email TEXT,
                    provider TEXT NOT NULL DEFAULT 'manual',
                    external_order_id TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS activations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    license_key TEXT NOT NULL REFERENCES licenses(license_key) ON DELETE CASCADE,
                    device_id TEXT NOT NULL,
                    device_name TEXT NOT NULL DEFAULT '',
                    activated_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    UNIQUE(license_key, device_id)
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(external_order_id)"
            )
            self._conn.commit()

    def create_license(
        self,
        customer_email: str | None = None,
        plan: str = "pro",
        max_devices: int = 5,
        provider: str = "manual",
        external_order_id: str | None = None,
        custom_key: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            if external_order_id:
                existing = self._conn.execute(
                    "SELECT * FROM licenses WHERE external_order_id = ?",
                    (external_order_id,),
                ).fetchone()
                if existing:
                    return dict(existing)

            key = (custom_key or generate_license_key()).strip().upper()
            now = _utc_now()
            self._conn.execute(
                """
                INSERT INTO licenses (
                    license_key, plan, status, max_devices,
                    customer_email, provider, external_order_id, created_at
                ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    plan,
                    max(1, int(max_devices)),
                    customer_email,
                    provider,
                    external_order_id,
                    now,
                ),
            )
            self._conn.commit()
            row = self._conn.execute(
                "SELECT * FROM licenses WHERE license_key = ?", (key,)
            ).fetchone()
            return dict(row)

    def revoke_license(
        self,
        license_key: str | None = None,
        external_order_id: str | None = None,
    ) -> int:
        with self._lock:
            if license_key:
                cur = self._conn.execute(
                    "UPDATE licenses SET status = 'revoked' WHERE license_key = ?",
                    (license_key.strip().upper(),),
                )
            elif external_order_id:
                cur = self._conn.execute(
                    "UPDATE licenses SET status = 'revoked' WHERE external_order_id = ?",
                    (external_order_id,),
                )
            else:
                return 0
            self._conn.commit()
            return cur.rowcount

    def activate_device(
        self,
        license_key: str,
        device_id: str,
        device_name: str = "",
    ) -> tuple[bool, dict[str, Any]]:
        clean_key = (license_key or "").strip().upper()
        clean_device = (device_id or "").strip()
        if not clean_key or not clean_device:
            return False, {"valid": False, "error": "MISSING_FIELDS"}

        with self._lock:
            lic = self._conn.execute(
                "SELECT * FROM licenses WHERE license_key = ?", (clean_key,)
            ).fetchone()
            if not lic:
                return False, {"valid": False, "error": "LICENSE_NOT_FOUND"}
            if lic["status"] != "active":
                return False, {"valid": False, "error": "LICENSE_REVOKED"}

            now = _utc_now()
            existing_act = self._conn.execute(
                "SELECT * FROM activations WHERE license_key = ? AND device_id = ?",
                (clean_key, clean_device),
            ).fetchone()

            count_row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM activations WHERE license_key = ?",
                (clean_key,),
            ).fetchone()
            used = int(count_row["cnt"])

            if existing_act:
                self._conn.execute(
                    "UPDATE activations SET last_seen_at = ?, device_name = ? WHERE id = ?",
                    (now, device_name[:120], existing_act["id"]),
                )
                self._conn.commit()
                return True, {
                    "valid": True,
                    "plan": lic["plan"],
                    "devices_used": used,
                    "max_devices": lic["max_devices"],
                }

            if used >= int(lic["max_devices"]):
                return False, {
                    "valid": False,
                    "error": "DEVICE_LIMIT_REACHED",
                    "devices_used": used,
                    "max_devices": lic["max_devices"],
                }

            self._conn.execute(
                """
                INSERT INTO activations (license_key, device_id, device_name, activated_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (clean_key, clean_device, device_name[:120], now, now),
            )
            self._conn.commit()
            return True, {
                "valid": True,
                "plan": lic["plan"],
                "devices_used": used + 1,
                "max_devices": lic["max_devices"],
            }

    def validate_device(
        self, license_key: str, device_id: str
    ) -> tuple[bool, dict[str, Any]]:
        clean_key = (license_key or "").strip().upper()
        clean_device = (device_id or "").strip()
        if not clean_key or not clean_device:
            return False, {"valid": False, "error": "MISSING_FIELDS"}

        with self._lock:
            lic = self._conn.execute(
                "SELECT * FROM licenses WHERE license_key = ?", (clean_key,)
            ).fetchone()
            if not lic:
                return False, {"valid": False, "error": "LICENSE_NOT_FOUND"}
            if lic["status"] != "active":
                return False, {"valid": False, "error": "LICENSE_REVOKED"}

            act = self._conn.execute(
                "SELECT id FROM activations WHERE license_key = ? AND device_id = ?",
                (clean_key, clean_device),
            ).fetchone()
            if not act:
                return False, {"valid": False, "error": "DEVICE_NOT_ACTIVATED"}

            self._conn.execute(
                "UPDATE activations SET last_seen_at = ? WHERE id = ?",
                (_utc_now(), act["id"]),
            )
            self._conn.commit()
            count_row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM activations WHERE license_key = ?",
                (clean_key,),
            ).fetchone()
            return True, {
                "valid": True,
                "plan": lic["plan"],
                "devices_used": int(count_row["cnt"]),
                "max_devices": lic["max_devices"],
            }

    def deactivate_device(self, license_key: str, device_id: str) -> dict[str, Any]:
        clean_key = (license_key or "").strip().upper()
        clean_device = (device_id or "").strip()
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM activations WHERE license_key = ? AND device_id = ?",
                (clean_key, clean_device),
            )
            self._conn.commit()
            return {"deactivated": cur.rowcount > 0}

    def list_licenses(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT l.*, COUNT(a.id) AS devices_used
                FROM licenses l
                LEFT JOIN activations a ON a.license_key = l.license_key
                GROUP BY l.license_key
                ORDER BY l.created_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]
