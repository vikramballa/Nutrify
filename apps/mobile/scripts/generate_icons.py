#!/usr/bin/env python3
"""Render the NutriChef app icons from the same mark the app draws in SVG.

Keeping this as a script instead of committing hand-exported PNGs means the
geometry has exactly one definition: change `src/components/Logo.tsx` and the
matching constants here, re-run, and every size stays in sync.

    python3 scripts/generate_icons.py

Writes into ../assets/:
    icon.png            1024  iOS/store icon, full-bleed gradient
    adaptive-icon.png   1024  Android foreground, transparent, inside safe zone
    splash-icon.png     1024  launch mark, transparent
    favicon.png           64  web tab
"""

from pathlib import Path

from PIL import Image, ImageDraw

# --- brand ----------------------------------------------------------------
# Mirrors apps/mobile/src/theme/colors.ts.
CORAL_LIGHT = (255, 154, 94)  # #FF9A5E — gradient start
CORAL_DARK = (232, 95, 42)  # #E85F2A — gradient end (colors.primaryDark)
CORAL = (255, 122, 69)  # #FF7A45 — colors.primary
WHITE = (255, 255, 255)

# The mark is authored in a 48x48 grid, same as the SVG viewBox.
GRID = 48.0

# Supersample, then downscale: PIL does not antialias fills.
SS = 8

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def bezier(p0, p1, p2, p3, steps=48):
    """Flatten one cubic Bezier into points (the SVG leaf paths are all cubics)."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        out.append((x, y))
    return out


# Leaf outlines, transcribed from LEAF_RIGHT / LEAF_LEFT in Logo.tsx.
LEAF_RIGHT = [
    ((24.8, 19.8), (24.8, 12.6), (29.6, 7.5), (36.5, 6.6)),
    ((36.5, 6.6), (37.2, 13.8), (32.4, 19.2), (24.8, 19.8)),
]
LEAF_LEFT = [
    ((22.4, 19.8), (22.4, 14.8), (19.2, 11.1), (13.9, 10.3)),
    ((13.9, 10.3), (13.3, 15.6), (16.6, 19.2), (22.4, 19.8)),
]


def leaf_points(curves, scale):
    points = []
    for c in curves:
        points.extend(bezier(*c))
    return [(x * scale, y * scale) for x, y in points]


def _mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top, bottom):
    """Diagonal two-stop gradient, drawn tiny and scaled up (it is smooth)."""
    small = Image.new("RGB", (2, 2))
    small.putpixel((0, 0), top)
    small.putpixel((1, 0), _mix(top, bottom, 0.5))
    small.putpixel((0, 1), _mix(top, bottom, 0.5))
    small.putpixel((1, 1), bottom)
    return small.resize((size, size), Image.BICUBIC).convert("RGBA")


def draw_mark(size, colour, alpha_bowl=235, alpha_leaf_left=184):
    """The bowl-and-sprout mark on a transparent canvas of `size` px."""
    canvas = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    s = size * SS / GRID  # grid units -> supersampled px

    # The left leaf sits behind and reads quieter, as in the SVG.
    d.polygon(leaf_points(LEAF_LEFT, s), fill=colour + (alpha_leaf_left,))
    d.polygon(leaf_points(LEAF_RIGHT, s), fill=colour + (255,))

    # Rim: a pill from x 7.5..40.5, y 21.5..25.9.
    d.rounded_rectangle(
        [7.5 * s, 21.5 * s, 40.5 * s, 25.9 * s], radius=2.2 * s, fill=colour + (255,)
    )

    # Bowl: the lower half of a circle of radius 15 centred on the rim line,
    # which is exactly what the SVG path traces.
    d.pieslice(
        [9 * s, 10.5 * s, 39 * s, 40.5 * s], start=0, end=180, fill=colour + (alpha_bowl,)
    )

    return canvas.resize((size, size), Image.LANCZOS)


def tile_icon(size):
    """Full-bleed gradient badge with the white mark and a lit top-left sheen."""
    base = gradient(size, CORAL_LIGHT, CORAL_DARK)

    sheen = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).polygon(
        [(0, 0), (size * SS, 0), (0, size * SS * 34 / 48)], fill=WHITE + (31,)
    )
    base.alpha_composite(sheen.resize((size, size), Image.LANCZOS))

    # 76% keeps the mark clear of the corner radius iOS and the stores apply.
    glyph_size = round(size * 0.76)
    glyph = draw_mark(glyph_size, WHITE)
    offset = (size - glyph_size) // 2
    base.alpha_composite(glyph, (offset, offset))
    return base


def centred(mark, size, fraction):
    """Place `mark` at `fraction` of a transparent square canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = round(size * fraction)
    canvas.alpha_composite(mark(inner), ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)

    # iOS/store icon: no transparency, no pre-rounded corners.
    icon = tile_icon(1024)
    icon.convert("RGB").save(ASSETS / "icon.png")

    # Android foreground: the outer third of an adaptive icon can be masked
    # off, so the glyph has to live well inside the safe zone.
    centred(lambda s: draw_mark(s, WHITE), 1024, 0.52).save(ASSETS / "adaptive-icon.png")

    # Splash sits on the warm background from app.json, so the mark is coral.
    centred(lambda s: draw_mark(s, CORAL), 1024, 0.62).save(ASSETS / "splash-icon.png")

    icon.resize((64, 64), Image.LANCZOS).save(ASSETS / "favicon.png")

    for f in sorted(ASSETS.glob("*.png")):
        print(f"{f.name:20} {Image.open(f).size}")


if __name__ == "__main__":
    main()
