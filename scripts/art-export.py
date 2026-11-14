#!/usr/bin/env python3
"""Export art/raw/*.png to web/public/art/*.webp at web sizes. Picks the newest -vN variant per key.
Props and fish on chroma green get keyed to alpha."""
import re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / 'art/raw', ROOT / 'web/public/art'
OUT.mkdir(parents=True, exist_ok=True)

def newest(files):
    best = {}
    for f in files:
        m = re.match(r'(.+?)(?:-v(\d+))?\.png$', f.name)
        key, v = m.group(1), int(m.group(2) or 1)
        if key not in best or v > best[key][0]:
            best[key] = (v, f)
    return {k: f for k, (v, f) in best.items()}

def key_green(im):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if g > 150 and g > r * 1.35 and g > b * 1.35:
                px[x, y] = (r, g, b, 0)
            elif g > r * 1.15 and g > b * 1.15 and g > 90:  # despill edges
                px[x, y] = (r, min(g, max(r, b)), b, int(a * 0.55))
    return im

for key, f in sorted(newest(RAW.glob('*.png')).items()):
    im = Image.open(f)
    if key.startswith(('bg_', 'keyart')):
        im = im.convert('RGB'); im.thumbnail((2560, 1440)); q = 82
    elif key.endswith(('_calm', '_cracked')):
        im = im.convert('RGB'); im.thumbnail((640, 800)); q = 84
    elif key.startswith(('prop_', 'fish_')):
        im = key_green(im); im.thumbnail((640, 640)); q = 86
    else:
        im = im.convert('RGB'); im.thumbnail((1600, 1600)); q = 82
    dest = OUT / f'{key}.webp'
    im.save(dest, 'WEBP', quality=q, method=6)
    print(f'{key}: {im.size} -> {dest.stat().st_size // 1024} KB')
