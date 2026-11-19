"""ZeroFlash Blur License & Webhook HTTP Server (zero external dependencies)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

# Allow running directly as `python backend/app.py`
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from db import LicenseStore
from security import verify_bearer_token, verify_lemonsqueezy_signature

MAX_BODY_BYTES = 1024 * 1024  # 1 MB


class ServerConfig:
    def __init__(
        self,
        store: LicenseStore,
        admin_api_key: str = "",
        lemonsqueezy_secret: str = "",
        gumroad_seller_id: str = "",
    ) -> None:
        self.store = store
        self.admin_api_key = admin_api_key
        self.lemonsqueezy_secret = lemonsqueezy_secret
        self.gumroad_seller_id = gumroad_seller_id


def make_handler(config: ServerConfig) -> type[BaseHTTPRequestHandler]:
    class ZeroFlashHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: Any) -> None:
            # Keep server output concise unless debugging
            if os.environ.get("ZF_QUIET_LOGS") == "1":
                return
            super().log_message(format, *args)

        def _send_cors_headers(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization, X-Signature",
            )

        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.close_connection = True
            self.send_response(status)
            self._send_cors_headers()
            self.send_header("Connection", "close")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_raw_body(self) -> bytes | None:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_CONTENT_LENGTH"})
                return None
            if length < 0 or length > MAX_BODY_BYTES:
                self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "BODY_TOO_LARGE"})
                return None
            return self.rfile.read(length) if length > 0 else b""

        def _read_json(self) -> tuple[bytes, dict[str, Any]] | None:
            raw = self._read_raw_body()
            if raw is None:
                return None
            if not raw:
                return raw, {}
            try:
                parsed = json.loads(raw.decode("utf-8"))
                if not isinstance(parsed, dict):
                    raise ValueError("Expected JSON object")
                return raw, parsed
            except (UnicodeDecodeError, ValueError):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_JSON"})
                return None

        def do_OPTIONS(self) -> None:
            self.close_connection = True
            self.send_response(HTTPStatus.NO_CONTENT)
            self._send_cors_headers()
            self.send_header("Connection", "close")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self) -> None:
            path = self.path.split("?", 1)[0]
            if path == "/health":
                self._send_json(HTTPStatus.OK, {"status": "ok", "service": "zeroflash-licenses"})
                return

            if path == "/api/v1/admin/keys":
                if not config.admin_api_key:
                    self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "ADMIN_NOT_CONFIGURED"})
                    return
                if not verify_bearer_token(
                    self.headers.get("Authorization", ""), config.admin_api_key
                ):
                    self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "UNAUTHORIZED"})
                    return
                self._send_json(HTTPStatus.OK, {"licenses": config.store.list_licenses()})
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})

        def do_POST(self) -> None:
            path = self.path.split("?", 1)[0]

            if path == "/api/v1/licenses/activate":
                res = self._read_json()
                if res is None:
                    return
                _, data = res
                ok, payload = config.store.activate_device(
                    license_key=str(data.get("license_key", "")),
                    device_id=str(data.get("device_id", "")),
                    device_name=str(data.get("device_name", "")),
                )
                status = HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST
                if payload.get("error") == "LICENSE_NOT_FOUND":
                    status = HTTPStatus.NOT_FOUND
                elif payload.get("error") == "LICENSE_REVOKED":
                    status = HTTPStatus.FORBIDDEN
                elif payload.get("error") == "DEVICE_LIMIT_REACHED":
                    status = HTTPStatus.CONFLICT
                self._send_json(status, payload)
                return

            if path == "/api/v1/licenses/validate":
                res = self._read_json()
                if res is None:
                    return
                _, data = res
                ok, payload = config.store.validate_device(
                    license_key=str(data.get("license_key", "")),
                    device_id=str(data.get("device_id", "")),
                )
                self._send_json(HTTPStatus.OK if ok else HTTPStatus.FORBIDDEN, payload)
                return

            if path == "/api/v1/licenses/deactivate":
                res = self._read_json()
                if res is None:
                    return
                _, data = res
                out = config.store.deactivate_device(
                    license_key=str(data.get("license_key", "")),
                    device_id=str(data.get("device_id", "")),
                )
                self._send_json(HTTPStatus.OK, out)
                return

            if path == "/api/v1/admin/keys":
                if not config.admin_api_key:
                    self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "ADMIN_NOT_CONFIGURED"})
                    return
                if not verify_bearer_token(
                    self.headers.get("Authorization", ""), config.admin_api_key
                ):
                    self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "UNAUTHORIZED"})
                    return
                res = self._read_json()
                if res is None:
                    return
                _, data = res
                created = config.store.create_license(
                    customer_email=data.get("email"),
                    plan=str(data.get("plan", "pro")),
                    max_devices=int(data.get("max_devices", 5)),
                    provider=str(data.get("provider", "manual")),
                    external_order_id=data.get("external_order_id"),
                )
                self._send_json(HTTPStatus.CREATED, {"license": created})
                return

            if path == "/api/v1/admin/revoke":
                if not config.admin_api_key:
                    self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "ADMIN_NOT_CONFIGURED"})
                    return
                if not verify_bearer_token(
                    self.headers.get("Authorization", ""), config.admin_api_key
                ):
                    self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "UNAUTHORIZED"})
                    return
                res = self._read_json()
                if res is None:
                    return
                _, data = res
                revoked = config.store.revoke_license(
                    license_key=data.get("license_key"),
                    external_order_id=data.get("external_order_id"),
                )
                self._send_json(HTTPStatus.OK, {"revoked_count": revoked})
                return

            if path == "/api/v1/webhooks/lemonsqueezy":
                self._handle_lemonsqueezy_webhook()
                return

            if path == "/api/v1/webhooks/gumroad":
                self._handle_gumroad_webhook()
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})

        def _handle_lemonsqueezy_webhook(self) -> None:
            if not config.lemonsqueezy_secret:
                self._send_json(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"error": "WEBHOOK_SECRET_NOT_CONFIGURED"},
                )
                return

            raw = self._read_raw_body()
            if raw is None:
                return
            sig = self.headers.get("X-Signature", "")
            if not verify_lemonsqueezy_signature(raw, sig, config.lemonsqueezy_secret):
                self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "INVALID_SIGNATURE"})
                return

            try:
                body = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_JSON"})
                return

            event_name = body.get("meta", {}).get("event_name", "")
            data_obj = body.get("data", {})
            attrs = data_obj.get("attributes", {})
            order_id = str(attrs.get("order_id") or data_obj.get("id") or "")
            email = attrs.get("user_email")

            if event_name in ("order_created", "subscription_created"):
                lic = config.store.create_license(
                    customer_email=email,
                    provider="lemonsqueezy",
                    external_order_id=f"ls:{order_id}" if order_id else None,
                )
                self._send_json(
                    HTTPStatus.OK,
                    {"ok": True, "action": "issued", "license_key": lic["license_key"]},
                )
                return

            if event_name in (
                "order_refunded",
                "subscription_cancelled",
                "subscription_expired",
            ):
                revoked = config.store.revoke_license(
                    external_order_id=f"ls:{order_id}" if order_id else None
                )
                self._send_json(
                    HTTPStatus.OK,
                    {"ok": True, "action": "revoked", "revoked_count": revoked},
                )
                return

            self._send_json(HTTPStatus.OK, {"ok": True, "action": "ignored"})

        def _handle_gumroad_webhook(self) -> None:
            if not config.gumroad_seller_id:
                self._send_json(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"error": "GUMROAD_SELLER_NOT_CONFIGURED"},
                )
                return

            raw = self._read_raw_body()
            if raw is None:
                return

            ctype = self.headers.get("Content-Type", "")
            if "application/json" in ctype:
                try:
                    data = json.loads(raw.decode("utf-8"))
                except (UnicodeDecodeError, ValueError):
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_JSON"})
                    return
            else:
                parsed = parse_qs(raw.decode("utf-8"), keep_blank_values=True)
                data = {k: v[0] for k, v in parsed.items()}

            if str(data.get("seller_id", "")) != config.gumroad_seller_id:
                self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "INVALID_SELLER"})
                return

            sale_id = str(data.get("sale_id", ""))
            refunded = str(data.get("refunded", "false")).lower() == "true"

            if refunded:
                revoked = config.store.revoke_license(
                    external_order_id=f"gr:{sale_id}" if sale_id else None
                )
                self._send_json(HTTPStatus.OK, {"ok": True, "revoked_count": revoked})
                return

            lic = config.store.create_license(
                customer_email=data.get("email"),
                provider="gumroad",
                external_order_id=f"gr:{sale_id}" if sale_id else None,
            )
            self._send_json(
                HTTPStatus.OK, {"ok": True, "license_key": lic["license_key"]}
            )

    return ZeroFlashHandler


def create_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    db_path: str | Path | None = None,
    admin_api_key: str | None = None,
    lemonsqueezy_secret: str | None = None,
    gumroad_seller_id: str | None = None,
) -> tuple[ThreadingHTTPServer, LicenseStore]:
    resolved_db = Path(
        db_path or os.environ.get("ZF_DB_PATH") or (BACKEND_DIR / "data" / "licenses.db")
    )
    store = LicenseStore(resolved_db)
    config = ServerConfig(
        store=store,
        admin_api_key=(
            admin_api_key
            if admin_api_key is not None
            else os.environ.get("ADMIN_API_KEY", "")
        ),
        lemonsqueezy_secret=(
            lemonsqueezy_secret
            if lemonsqueezy_secret is not None
            else os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")
        ),
        gumroad_seller_id=(
            gumroad_seller_id
            if gumroad_seller_id is not None
            else os.environ.get("GUMROAD_SELLER_ID", "")
        ),
    )
    server = ThreadingHTTPServer((host, port), make_handler(config))
    return server, store


def main() -> None:
    parser = argparse.ArgumentParser(description="ZeroFlash Blur License Server")
    parser.add_argument("--host", default=os.environ.get("ZF_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8787")))
    parser.add_argument("--db", default=None, help="Path to SQLite database")
    parser.add_argument(
        "--seed-demo",
        action="store_true",
        help="Seed demo key ZF-PRO-DEMO-2026-TEST for local extension testing",
    )
    args = parser.parse_args()

    server, store = create_server(host=args.host, port=args.port, db_path=args.db)

    if args.seed_demo or os.environ.get("ZF_SEED_DEMO") == "1":
        demo_key = "ZF-PRO-DEMO-2026-TEST"
        existing = [l for l in store.list_licenses() if l["license_key"] == demo_key]
        if not existing:
            store.create_license(
                customer_email="demo@local.test",
                provider="demo",
                custom_key=demo_key,
            )
        print(f"Demo Pro license seeded: {demo_key}")

    print(f"ZeroFlash License Server listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()
        store.close()


if __name__ == "__main__":
    main()
