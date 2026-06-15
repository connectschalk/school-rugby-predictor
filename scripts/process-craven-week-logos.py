#!/usr/bin/env python3
"""Remove edge-connected white/black canvas from Craven Week team logo PNGs."""

from __future__ import annotations

import os
from collections import deque

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
LOGO_DIR = os.path.join(ROOT, 'public', 'craven-week-team-logos')

WHITE_MIN = 240
BLACK_MAX = 35


def is_canvas_pixel(r: int, g: int, b: int) -> bool:
    if r >= WHITE_MIN and g >= WHITE_MIN and b >= WHITE_MIN:
        return True
    if r <= BLACK_MAX and g <= BLACK_MAX and b <= BLACK_MAX:
        return True
    return False


def remove_edge_canvas(img: Image.Image) -> Image.Image:
    img = img.convert('RGBA')
    w, h = img.size
    pixels = img.load()
    q: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()
    to_clear: set[tuple[int, int]] = set()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if (x, y) in visited:
            continue
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        visited.add((x, y))
        r, g, b, _a = pixels[x, y]
        if not is_canvas_pixel(r, g, b):
            continue
        to_clear.add((x, y))
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    for x, y in to_clear:
        r, g, b, _a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)

    return img


def main() -> None:
    for name in sorted(os.listdir(LOGO_DIR)):
        if not name.endswith('.png'):
            continue
        path = os.path.join(LOGO_DIR, name)
        img = Image.open(path)
        out = remove_edge_canvas(img)
        out.save(path, 'PNG', optimize=True)
        print(f'processed {name}')


if __name__ == '__main__':
    main()
