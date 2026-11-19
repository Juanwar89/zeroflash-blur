"""Generate crisp PNG icons for ZeroFlash Blur using pure Python (no Pillow required)."""

from __future__ import annotations

import math
import os
import struct
import zlib
from pathlib import Path


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = chunk_type + data
    return (
        struct.pack(">I", len(data))
        + chunk
        + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)
    )


def _encode_png(width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # Filter type 0 (None)
        row_start = y * width
        for x in range(width):
            r, g, b, a = pixels[row_start + x]
            raw.extend((r, g, b, a))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat)
        + _png_chunk(b"IEND", b"")
    )


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _blend(
    bg: tuple[int, int, int, int], fg: tuple[int, int, int, int]
) -> tuple[int, int, int, int]:
    fa = fg[3] / 255.0
    ba = bg[3] / 255.0
    out_a = fa + ba * (1.0 - fa)
    if out_a <= 0:
        return (0, 0, 0, 0)
    r = int((fg[0] * fa + bg[0] * ba * (1.0 - fa)) / out_a)
    g = int((fg[1] * fa + bg[1] * ba * (1.0 - fa)) / out_a)
    b = int((fg[2] * fa + bg[2] * ba * (1.0 - fa)) / out_a)
    return (r, g, b, int(out_a * 255))


def _rounded_rect_sdf(px: float, py: float, half: float, radius: float) -> float:
    dx = abs(px) - (half - radius)
    dy = abs(py) - (half - radius)
    qx = max(dx, 0.0)
    qy = max(dy, 0.0)
    return math.hypot(qx, qy) + min(max(dx, dy), 0.0) - radius


def _shield_inside(nx: float, ny: float) -> float:
    """Return signed-like coverage (positive inside) for a centered shield in [-1, 1]^2."""
    # Shield spans roughly x in [-0.52, 0.52], y in [-0.58, 0.62]
    if ny < -0.58 or ny > 0.62:
        return -1.0
    if ny < 0.05:
        half_w = 0.50
    else:
        t = (ny - 0.05) / 0.57
        half_w = 0.50 * (1.0 - t ** 1.6)
    dist_x = half_w - abs(nx)
    dist_top = ny - (-0.58)
    dist_bot = 0.62 - ny
    return min(dist_x, dist_top, dist_bot)


def render_icon(size: int) -> bytes:
    """Render a crisp anti-aliased ZeroFlash icon at `size x size`."""
    pixels: list[tuple[int, int, int, int]] = []
    aa = 1.5 / size

    for y in range(size):
        for x in range(size):
            # 2x2 supersampling for crisp edges at 16px and 32px
            acc_r = acc_g = acc_b = acc_a = 0.0
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    nx = ((x + sx) / size) * 2.0 - 1.0
                    ny = ((y + sy) / size) * 2.0 - 1.0

                    # Background rounded square
                    sdf = _rounded_rect_sdf(nx, ny, 0.94, 0.34)
                    bg_alpha = max(0.0, min(1.0, (0.0 - sdf) / aa))

                    # Deep slate to indigo gradient
                    grad_t = max(0.0, min(1.0, (nx + ny + 2.0) / 4.0))
                    bg_r = int(_lerp(15, 30, grad_t))
                    bg_g = int(_lerp(23, 41, grad_t))
                    bg_b = int(_lerp(42, 79, grad_t))
                    color = (bg_r, bg_g, bg_b, int(bg_alpha * 255))

                    # Subtle inner glow top-left
                    if bg_alpha > 0:
                        # Shield body
                        sc = _shield_inside(nx, ny)
                        shield_alpha = max(0.0, min(1.0, sc / (aa * 1.4)))
                        if shield_alpha > 0:
                            st = max(0.0, min(1.0, (ny + 0.58) / 1.2))
                            sr = int(_lerp(56, 99, st))
                            sg = int(_lerp(189, 102, st))
                            sb = int(_lerp(248, 241, st))
                            color = _blend(color, (sr, sg, sb, int(shield_alpha * 255)))

                        # Inner dark shield core + 3 privacy blur bars
                        inner = _shield_inside(nx * 1.18, (ny - 0.01) * 1.18)
                        inner_alpha = max(0.0, min(1.0, inner / (aa * 1.4)))
                        if inner_alpha > 0:
                            color = _blend(color, (15, 23, 42, int(inner_alpha * 220)))

                        # Privacy blur horizontal bars inside the shield
                        bars = [
                            (-0.22, 0.25, 0.075, (248, 250, 252, 235)),
                            (-0.02, 0.20, 0.075, (148, 163, 184, 210)),
                            (0.18, 0.14, 0.075, (56, 189, 248, 225)),
                        ]
                        for bar_y, half_w, half_h, bar_col in bars:
                            in_bar = (
                                abs(nx) <= half_w
                                and abs(ny - bar_y) <= half_h
                                and inner > 0.02
                            )
                            if in_bar:
                                color = _blend(color, bar_col)

                    acc_r += color[0]
                    acc_g += color[1]
                    acc_b += color[2]
                    acc_a += color[3]

            pixels.append(
                (
                    int(acc_r / 4),
                    int(acc_g / 4),
                    int(acc_b / 4),
                    int(acc_a / 4),
                )
            )

    return _encode_png(size, size, pixels)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    icons_dir = root / "extension" / "icons"
    os.makedirs(icons_dir, exist_ok=True)
    for size in (16, 32, 48, 128):
        out_path = icons_dir / f"icon{size}.png"
        out_path.write_bytes(render_icon(size))
        print(f"Generated {out_path}")


if __name__ == "__main__":
    main()
