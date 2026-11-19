"""Integration tests for ZeroFlash Blur license and webhook HTTP server."""

from __future__ import annotations

import hashlib
import hmac
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import create_server


class BackendHttpTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self._tmp.name) / "test_licenses.db"
        self.admin_secret = "test-admin-secret"
        self.ls_secret = "test-ls-webhook-secret"
        self.gr_seller = "seller_123"
        self.server, self.store = create_server(
            host="127.0.0.1",
            port=0,
            db_path=self.db_path,
            admin_api_key=self.admin_secret,
            lemonsqueezy_secret=self.ls_secret,
            gumroad_seller_id=self.gr_seller,
        )
        self.port = self.server.server_address[1]
        self.base_url = f"http://127.0.0.1:{self.port}"
        self._thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self._thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.store.close()
        self._tmp.cleanup()

    def _req(
        self,
        method: str,
        path: str,
        body: bytes | dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict]:
        req_headers = dict(headers or {})
        raw_body: bytes | None = None
        if isinstance(body, dict):
            raw_body = json.dumps(body).encode("utf-8")
            req_headers.setdefault("Content-Type", "application/json")
        elif isinstance(body, bytes):
            raw_body = body

        req = Request(
            f"{self.base_url}{path}",
            data=raw_body,
            headers=req_headers,
            method=method,
        )
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8"))

    def test_health(self) -> None:
        status, data = self._req("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")

    def test_admin_auth_and_device_limits(self) -> None:
        status, _ = self._req("POST", "/api/v1/admin/keys", {"email": "a@b.com"})
        self.assertEqual(status, 401)

        status, created = self._req(
            "POST",
            "/api/v1/admin/keys",
            {"email": "buyer@example.com", "max_devices": 2},
            headers={"Authorization": f"Bearer {self.admin_secret}"},
        )
        self.assertEqual(status, 201)
        key = created["license"]["license_key"]
        self.assertTrue(key.startswith("ZF-PRO-"))

        # Activate device 1
        s1, d1 = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": key, "device_id": "dev-1", "device_name": "Work Laptop"},
        )
        self.assertEqual(s1, 200)
        self.assertTrue(d1["valid"])
        self.assertEqual(d1["devices_used"], 1)

        # Idempotent re-activation on dev-1
        s1_again, d1_again = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": key, "device_id": "dev-1"},
        )
        self.assertEqual(s1_again, 200)
        self.assertEqual(d1_again["devices_used"], 1)

        # Activate device 2
        s2, d2 = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": key, "device_id": "dev-2"},
        )
        self.assertEqual(s2, 200)
        self.assertEqual(d2["devices_used"], 2)

        # Device 3 exceeds max_devices=2
        s3, d3 = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": key, "device_id": "dev-3"},
        )
        self.assertEqual(s3, 409)
        self.assertEqual(d3["error"], "DEVICE_LIMIT_REACHED")

        # Validate dev-2 works, dev-3 fails
        vs2, vd2 = self._req(
            "POST",
            "/api/v1/licenses/validate",
            {"license_key": key, "device_id": "dev-2"},
        )
        self.assertEqual(vs2, 200)
        self.assertTrue(vd2["valid"])

        vs3, _ = self._req(
            "POST",
            "/api/v1/licenses/validate",
            {"license_key": key, "device_id": "dev-3"},
        )
        self.assertEqual(vs3, 403)

        # Deactivate dev-1 and then activate dev-3
        ds, dd = self._req(
            "POST",
            "/api/v1/licenses/deactivate",
            {"license_key": key, "device_id": "dev-1"},
        )
        self.assertEqual(ds, 200)
        self.assertTrue(dd["deactivated"])

        s3_ok, d3_ok = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": key, "device_id": "dev-3"},
        )
        self.assertEqual(s3_ok, 200)
        self.assertEqual(d3_ok["devices_used"], 2)

    def test_lemonsqueezy_webhook_issue_and_refund(self) -> None:
        order_payload = {
            "meta": {"event_name": "order_created"},
            "data": {
                "id": "9001",
                "attributes": {"order_id": 9001, "user_email": "ls@buyer.io"},
            },
        }
        raw = json.dumps(order_payload).encode("utf-8")

        # Invalid signature rejected
        bad_s, _ = self._req(
            "POST",
            "/api/v1/webhooks/lemonsqueezy",
            body=raw,
            headers={"Content-Type": "application/json", "X-Signature": "deadbeef"},
        )
        self.assertEqual(bad_s, 401)

        sig = hmac.new(
            self.ls_secret.encode("utf-8"), raw, hashlib.sha256
        ).hexdigest()
        ok_s, ok_d = self._req(
            "POST",
            "/api/v1/webhooks/lemonsqueezy",
            body=raw,
            headers={"Content-Type": "application/json", "X-Signature": sig},
        )
        self.assertEqual(ok_s, 200)
        issued_key = ok_d["license_key"]

        # Verify key activates
        act_s, _ = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": issued_key, "device_id": "d1"},
        )
        self.assertEqual(act_s, 200)

        # Refund revokes key
        refund_raw = json.dumps(
            {
                "meta": {"event_name": "order_refunded"},
                "data": {"id": "9001", "attributes": {"order_id": 9001}},
            }
        ).encode("utf-8")
        refund_sig = hmac.new(
            self.ls_secret.encode("utf-8"), refund_raw, hashlib.sha256
        ).hexdigest()
        ref_s, ref_d = self._req(
            "POST",
            "/api/v1/webhooks/lemonsqueezy",
            body=refund_raw,
            headers={"Content-Type": "application/json", "X-Signature": refund_sig},
        )
        self.assertEqual(ref_s, 200)
        self.assertEqual(ref_d["revoked_count"], 1)

        val_s, val_d = self._req(
            "POST",
            "/api/v1/licenses/validate",
            {"license_key": issued_key, "device_id": "d1"},
        )
        self.assertEqual(val_s, 403)
        self.assertEqual(val_d["error"], "LICENSE_REVOKED")

    def test_gumroad_webhook_sale_and_refund(self) -> None:
        bad_body = urlencode(
            {"seller_id": "wrong", "sale_id": "g1", "email": "x@y.com"}
        ).encode("utf-8")
        s_bad, _ = self._req(
            "POST",
            "/api/v1/webhooks/gumroad",
            body=bad_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(s_bad, 401)

        sale_body = urlencode(
            {"seller_id": self.gr_seller, "sale_id": "g100", "email": "gr@buyer.io"}
        ).encode("utf-8")
        s_ok, d_ok = self._req(
            "POST",
            "/api/v1/webhooks/gumroad",
            body=sale_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(s_ok, 200)
        key = d_ok["license_key"]

        refund_body = urlencode(
            {"seller_id": self.gr_seller, "sale_id": "g100", "refunded": "true"}
        ).encode("utf-8")
        s_ref, d_ref = self._req(
            "POST",
            "/api/v1/webhooks/gumroad",
            body=refund_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(s_ref, 200)
        self.assertEqual(d_ref["revoked_count"], 1)

        s_act, d_act = self._req(
            "POST",
            "/api/v1/licenses/activate",
            {"license_key": key, "device_id": "dev-x"},
        )
        self.assertEqual(s_act, 403)
        self.assertEqual(d_act["error"], "LICENSE_REVOKED")


if __name__ == "__main__":
    unittest.main()
