"""Draws the Family Game Night app icon, Top Shelf images and the two home
screen tiles (Singo Night, Jeopardy).

Usage: python3 Tools/make_app_art.py FamilyGameNight/Assets.xcassets

Needs Pillow. Reuses the drawing helpers in make_icon.py (the Singo Night art).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

import make_icon as mi  # noqa: E402

GOLD = (250, 204, 21)


def gradient(w, h, top, bottom, glows):
    """Opaque diagonal gradient with soft coloured glows. glows: (fx, fy, fr, rgba)."""
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = min(1, max(0, (y / 63) * 0.7 + (x / 63) * 0.3))
            px[x, y] = mi.lerp(top, bottom, t)
    img = small.resize((w, h), Image.BILINEAR).convert("RGBA")
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    for fx, fy, fr, color in glows:
        r, cx, cy = fr * h, fx * w, fy * h
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=h * 0.18))
    return Image.alpha_composite(img, glow).convert("RGB")


def shadowed_text(layer, xy, text, font, fill, h, anchor="mm", blur=0.03, offset=0.025):
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((xy[0], xy[1] + h * offset), text, font=font, fill=(0, 0, 0, 160), anchor=anchor)
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius=h * blur)))
    ImageDraw.Draw(layer).text(xy, text, font=font, fill=fill, anchor=anchor)


def spaced_text(layer, cx, y, text, font, fill, spacing):
    d = ImageDraw.Draw(layer)
    widths = [d.textlength(ch, font=font) for ch in text]
    x = cx - (sum(widths) + spacing * (len(text) - 1)) / 2
    for ch, cw in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill, anchor="lm")
        x += cw + spacing


def board_tile(layer, cx, cy, tw, th, angle, label, h):
    """A blue game-board square with a gold label, tilted by angle degrees."""
    pad = int(h * 0.1)
    tile = Image.new("RGBA", (int(tw) + 2 * pad, int(th) + 2 * pad), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    box = [pad, pad, pad + tw, pad + th]
    td.rounded_rectangle(box, radius=th * 0.12, fill=(25, 52, 160, 255), outline=(120, 160, 255, 255), width=max(2, int(th * 0.03)))
    font = ImageFont.truetype(mi.TITLE_FONT, int(th * 0.62))
    td.text((pad + tw / 2, pad + th / 2), label, font=font, fill=GOLD + (255,), anchor="mm")
    tile = tile.rotate(angle, resample=Image.BICUBIC, expand=True)
    shadow = Image.new("RGBA", tile.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 120), mask=tile.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=th * 0.08))
    x, y = int(cx - tile.width / 2), int(cy - tile.height / 2)
    layer.alpha_composite(shadow, (x, y + int(th * 0.06)))
    layer.alpha_composite(tile, (x, y))


# ---------- Family Game Night icon and Top Shelf ----------

def fgn_back(w, h):
    return gradient(w, h, (12, 14, 48), (58, 28, 120), [
        (0.12, 0.15, 0.55, (249, 115, 22, 95)),
        (0.88, 0.88, 0.6, (59, 130, 246, 120)),
        (0.75, 0.1, 0.35, (236, 72, 153, 90)),
    ])


def fgn_middle(w, h, wide=False):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if wide:  # Top Shelf: spread the pieces out so the text sits in the middle
        mi.draw_ball(layer, 0.10 * w, 0.30 * h, 0.17 * h, mi.BALL_COLORS[0], "♪")
        mi.draw_ball(layer, 0.90 * w, 0.72 * h, 0.15 * h, mi.BALL_COLORS[2], "♫")
        board_tile(layer, 0.86 * w, 0.24 * h, 0.12 * w, 0.2 * h, 9, "$", h)
        board_tile(layer, 0.14 * w, 0.76 * h, 0.1 * w, 0.17 * h, -10, "$", h)
    else:
        mi.draw_ball(layer, 0.14 * w, 0.24 * h, 0.17 * h, mi.BALL_COLORS[0], "♪")
        mi.draw_ball(layer, 0.87 * w, 0.80 * h, 0.14 * h, mi.BALL_COLORS[2], "♫")
        board_tile(layer, 0.86 * w, 0.22 * h, 0.2 * w, 0.24 * h, 9, "$", h)
        board_tile(layer, 0.14 * w, 0.80 * h, 0.17 * w, 0.2 * h, -10, "$", h)
    return layer


def fgn_front(w, h, big=0.24, small=0.075):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    big_font = ImageFont.truetype(mi.TITLE_FONT, int(big * h))
    small_font = ImageFont.truetype(mi.SUB_FONT, int(small * h))
    cx = w / 2
    spaced_text(layer, cx, h * 0.24, "FAMILY", small_font, (255, 255, 255, 225), small * h * 0.55)
    shadowed_text(layer, (cx, h * 0.47), "GAME", big_font, (255, 255, 255, 255), h)
    shadowed_text(layer, (cx, h * 0.72), "NIGHT", big_font, GOLD + (255,), h)
    return layer


def fgn_flat(w, h, wide=False):
    img = fgn_back(w, h).convert("RGBA")
    img.alpha_composite(fgn_middle(w, h, wide))
    img.alpha_composite(fgn_front(w, h, 0.3 if wide else 0.24, 0.085 if wide else 0.075))
    return img.convert("RGB")


# ---------- Home screen tiles ----------

def singo_tile(w, h):
    img = mi.back_layer(w, h).convert("RGBA")
    img.alpha_composite(mi.middle_layer(w, h, mi.ICON_BALLS))
    img.alpha_composite(mi.front_layer(w, h, 0.34, 0.085))
    return img.convert("RGB")


def jeopardy_tile(w, h):
    img = gradient(w, h, (8, 16, 80), (28, 62, 175), [
        (0.15, 0.2, 0.5, (96, 165, 250, 90)),
        (0.85, 0.9, 0.55, (250, 204, 21, 70)),
    ]).convert("RGBA")
    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    cols, rows, gap = 6, 4, h * 0.025
    mx, my = w * 0.035, h * 0.08
    cw = (w - 2 * mx - gap * (cols - 1)) / cols
    chh = (h - 2 * my - gap * (rows - 1)) / rows
    font = ImageFont.truetype(mi.TITLE_FONT, int(min(chh * 0.42, cw * 0.27)))
    for r in range(rows):
        for c in range(cols):
            x, y = mx + c * (cw + gap), my + r * (chh + gap)
            gd.rounded_rectangle([x, y, x + cw, y + chh], radius=chh * 0.1, fill=(20, 40, 150, 255))
            gd.text((x + cw / 2, y + chh / 2), f"${(r + 1) * 200}", font=font, fill=GOLD + (255,), anchor="mm")
    grid.putalpha(grid.split()[3].point(lambda a: int(a * 0.55)))
    img.alpha_composite(grid)
    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    title_font = ImageFont.truetype(mi.TITLE_FONT, int(0.21 * h))
    # A dark band behind the title so it reads over the board.
    band = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(band).rounded_rectangle([w * 0.04, h * 0.31, w * 0.96, h * 0.87], radius=h * 0.05, fill=(6, 10, 50, 240))
    front.alpha_composite(band)
    shadowed_text(front, (w / 2, h * 0.485), "JEOPARDY", title_font, GOLD + (255,), h)
    spaced_text(front, w / 2, h * 0.73, "BUZZ IN", ImageFont.truetype(mi.SUB_FONT, int(0.075 * h)),
                (255, 255, 255, 235), 0.075 * h * 0.55)
    img.alpha_composite(front)
    return img.convert("RGB")


# ---------- Writing the asset catalog ----------

def save_stack(root, name, size, scales):
    stack = os.path.join(root, name + ".imagestack")
    os.makedirs(stack, exist_ok=True)
    mi.write_json(os.path.join(stack, "Contents.json"), {
        "info": {"author": "xcode", "version": 1},
        "layers": [{"filename": "Front.imagestacklayer"},
                   {"filename": "Middle.imagestacklayer"},
                   {"filename": "Back.imagestacklayer"}],
    })
    for layer, make in (("Front", fgn_front), ("Middle", fgn_middle), ("Back", fgn_back)):
        layer_dir = os.path.join(stack, layer + ".imagestacklayer")
        imageset = os.path.join(layer_dir, "Content.imageset")
        os.makedirs(imageset, exist_ok=True)
        mi.write_json(os.path.join(layer_dir, "Contents.json"), {"info": {"author": "xcode", "version": 1}})
        images = []
        for scale in scales:
            filename = f"{layer.lower()}{'' if scale == 1 else f'@{scale}x'}.png"
            make(size[0] * scale, size[1] * scale).save(os.path.join(imageset, filename))
            images.append({"filename": filename, "idiom": "tv", "scale": f"{scale}x"})
        mi.write_json(os.path.join(imageset, "Contents.json"), {"images": images, "info": {"author": "xcode", "version": 1}})


def save_shelf(root, name, size):
    imageset = os.path.join(root, name + ".imageset")
    os.makedirs(imageset, exist_ok=True)
    images = []
    for scale in (1, 2):
        filename = f"shelf{'' if scale == 1 else '@2x'}.png"
        fgn_flat(size[0] * scale, size[1] * scale, wide=True).save(os.path.join(imageset, filename))
        images.append({"filename": filename, "idiom": "tv", "scale": f"{scale}x"})
    mi.write_json(os.path.join(imageset, "Contents.json"), {"images": images, "info": {"author": "xcode", "version": 1}})


def save_tile(assets, name, make, size=(560, 336)):
    imageset = os.path.join(assets, name + ".imageset")
    os.makedirs(imageset, exist_ok=True)
    make(size[0] * 2, size[1] * 2).save(os.path.join(imageset, "tile@2x.png"))
    mi.write_json(os.path.join(imageset, "Contents.json"),
                  {"images": [{"filename": "tile@2x.png", "idiom": "tv", "scale": "2x"}],
                   "info": {"author": "xcode", "version": 1}})


def main():
    assets = sys.argv[1]
    os.makedirs(assets, exist_ok=True)
    mi.write_json(os.path.join(assets, "Contents.json"), {"info": {"author": "xcode", "version": 1}})
    brand = os.path.join(assets, "App Icon & Top Shelf Image.brandassets")
    os.makedirs(brand, exist_ok=True)
    mi.write_json(os.path.join(brand, "Contents.json"), {
        "assets": [
            {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
            {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
            {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
            {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
        ],
        "info": {"author": "xcode", "version": 1},
    })
    save_stack(brand, "App Icon", (400, 240), [1, 2])
    save_stack(brand, "App Icon - App Store", (1280, 768), [1])
    save_shelf(brand, "Top Shelf Image", (1920, 720))
    save_shelf(brand, "Top Shelf Image Wide", (2320, 720))
    save_tile(assets, "Tile-Singo", singo_tile)
    save_tile(assets, "Tile-Jeopardy", jeopardy_tile)


if __name__ == "__main__":
    main()
