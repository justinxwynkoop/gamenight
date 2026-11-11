"""Draws the Singo Night tvOS app icon layers and Top Shelf images.

Usage: python3 make_icon.py <Assets.xcassets path>
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

TITLE_FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
SUB_FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"
NOTE_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

BALL_COLORS = [
    (236, 72, 153),   # pink
    (59, 130, 246),   # blue
    (20, 184, 166),   # teal
    (250, 204, 21),   # yellow
    (168, 85, 247),   # purple
    (249, 115, 22),   # orange
]
NOTES = ["♪", "♫", "♪", "♫", "♪", "♫"]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def back_layer(w, h):
    """Opaque gradient background with soft colored glows."""
    top, bottom = (24, 10, 64), (76, 29, 149)
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = min(1, max(0, (y / 63) * 0.7 + (x / 63) * 0.3))
            px[x, y] = lerp(top, bottom, t)
    img = small.resize((w, h), Image.BILINEAR)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    for fx, fy, fr, color in [
        (0.15, 0.2, 0.55, (236, 72, 153, 110)),
        (0.85, 0.85, 0.6, (59, 130, 246, 120)),
        (0.7, 0.1, 0.35, (20, 184, 166, 90)),
    ]:
        r = fr * h
        cx, cy = fx * w, fy * h
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=h * 0.18))
    img = Image.alpha_composite(img.convert("RGBA"), glow)
    return img.convert("RGB")


def draw_ball(layer, cx, cy, r, color, note):
    """A glossy bingo ball with a music note on a white center."""
    d = ImageDraw.Draw(layer)
    # Shadow
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([cx - r, cy - r + r * 0.12, cx + r, cy + r + r * 0.12], fill=(0, 0, 0, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=r * 0.12))
    layer.alpha_composite(shadow)
    # Ball shaded lighter toward the top left, clipped to a circle
    steps = 40
    mask = Image.new("L", layer.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    ball = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(ball)
    for i in range(steps):
        t = i / steps
        rr = r * (1 - t) * 1.25
        shift = r * 0.4 * t
        c = lerp(color, (255, 255, 255), t * 0.6)
        bd.ellipse([cx - rr - shift, cy - rr - shift, cx + rr - shift, cy + rr - shift], fill=c + (255,))
    clipped = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    clipped.paste(ball, (0, 0), mask)
    layer.alpha_composite(clipped)
    d = ImageDraw.Draw(layer)
    # White center with a note
    inner = r * 0.52
    d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=(255, 255, 255, 255))
    font = ImageFont.truetype(NOTE_FONT, int(inner * 1.25))
    d.text((cx, cy + inner * 0.05), note, font=font, fill=color + (255,), anchor="mm")


def middle_layer(w, h, balls):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for i, (fx, fy, fr) in enumerate(balls):
        draw_ball(layer, fx * w, fy * h, fr * h, BALL_COLORS[i % len(BALL_COLORS)], NOTES[i % len(NOTES)])
    return layer


def front_layer(w, h, title_size, sub_size):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    title_font = ImageFont.truetype(TITLE_FONT, int(title_size * h))
    sub_font = ImageFont.truetype(SUB_FONT, int(sub_size * h))
    cx, cy = w / 2, h * 0.47

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((cx, cy + h * 0.025), "SINGO", font=title_font, fill=(0, 0, 0, 160), anchor="mm")
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=h * 0.03))
    layer.alpha_composite(shadow)

    d = ImageDraw.Draw(layer)
    d.text((cx, cy), "SINGO", font=title_font, fill=(255, 255, 255, 255), anchor="mm")

    # "NIGHT" with wide letter spacing under the title
    sub = "NIGHT"
    spacing = sub_size * h * 0.55
    widths = [d.textlength(ch, font=sub_font) for ch in sub]
    total = sum(widths) + spacing * (len(sub) - 1)
    x = cx - total / 2
    y = cy + title_size * h * 0.62
    for ch, cw in zip(sub, widths):
        d.text((x, y), ch, font=sub_font, fill=(255, 255, 255, 220), anchor="lm")
        x += cw + spacing
    return layer


# Ball positions (x fraction of width, y fraction of height, radius as fraction of height)
ICON_BALLS = [(0.12, 0.22, 0.16), (0.89, 0.76, 0.18), (0.86, 0.17, 0.11), (0.16, 0.82, 0.10)]
SHELF_BALLS = [(0.08, 0.3, 0.2), (0.2, 0.78, 0.14), (0.3, 0.18, 0.09),
               (0.72, 0.2, 0.12), (0.84, 0.7, 0.2), (0.94, 0.25, 0.11)]


def save_stack(root, name, size, scales):
    """An imagestack with Front/Middle/Back layers."""
    stack = os.path.join(root, name + ".imagestack")
    os.makedirs(stack, exist_ok=True)
    write_json(os.path.join(stack, "Contents.json"), {
        "info": {"author": "xcode", "version": 1},
        "layers": [{"filename": "Front.imagestacklayer"},
                   {"filename": "Middle.imagestacklayer"},
                   {"filename": "Back.imagestacklayer"}],
    })
    w0, h0 = size
    rendered = {}
    for scale in scales:
        w, h = w0 * scale, h0 * scale
        rendered[scale] = {
            "Back": back_layer(w, h),
            "Middle": middle_layer(w, h, ICON_BALLS),
            "Front": front_layer(w, h, 0.34, 0.085),
        }
    for layer in ["Front", "Middle", "Back"]:
        layer_dir = os.path.join(stack, layer + ".imagestacklayer")
        imageset = os.path.join(layer_dir, "Content.imageset")
        os.makedirs(imageset, exist_ok=True)
        write_json(os.path.join(layer_dir, "Contents.json"), {"info": {"author": "xcode", "version": 1}})
        images = []
        for scale in scales:
            filename = f"{layer.lower()}{'' if scale == 1 else f'@{scale}x'}.png"
            rendered[scale][layer].save(os.path.join(imageset, filename))
            images.append({"filename": filename, "idiom": "tv", "scale": f"{scale}x"})
        write_json(os.path.join(imageset, "Contents.json"),
                   {"images": images, "info": {"author": "xcode", "version": 1}})


def save_shelf(root, name, size):
    """A flat Top Shelf banner at 1x and 2x."""
    imageset = os.path.join(root, name + ".imageset")
    os.makedirs(imageset, exist_ok=True)
    images = []
    for scale in [1, 2]:
        w, h = size[0] * scale, size[1] * scale
        img = back_layer(w, h).convert("RGBA")
        img.alpha_composite(middle_layer(w, h, SHELF_BALLS))
        img.alpha_composite(front_layer(w, h, 0.36, 0.08))
        filename = f"shelf{'' if scale == 1 else '@2x'}.png"
        img.convert("RGB").save(os.path.join(imageset, filename))
        images.append({"filename": filename, "idiom": "tv", "scale": f"{scale}x"})
    write_json(os.path.join(imageset, "Contents.json"),
               {"images": images, "info": {"author": "xcode", "version": 1}})


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def main():
    assets = sys.argv[1]
    os.makedirs(assets, exist_ok=True)
    write_json(os.path.join(assets, "Contents.json"), {"info": {"author": "xcode", "version": 1}})
    brand = os.path.join(assets, "App Icon & Top Shelf Image.brandassets")
    os.makedirs(brand, exist_ok=True)
    write_json(os.path.join(brand, "Contents.json"), {
        "assets": [
            {"filename": "App Icon - App Store.imagestack", "idiom": "tv",
             "role": "primary-app-icon", "size": "1280x768"},
            {"filename": "App Icon.imagestack", "idiom": "tv",
             "role": "primary-app-icon", "size": "400x240"},
            {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv",
             "role": "top-shelf-image-wide", "size": "2320x720"},
            {"filename": "Top Shelf Image.imageset", "idiom": "tv",
             "role": "top-shelf-image", "size": "1920x720"},
        ],
        "info": {"author": "xcode", "version": 1},
    })
    save_stack(brand, "App Icon", (400, 240), [1, 2])
    save_stack(brand, "App Icon - App Store", (1280, 768), [1])
    save_shelf(brand, "Top Shelf Image", (1920, 720))
    save_shelf(brand, "Top Shelf Image Wide", (2320, 720))


if __name__ == "__main__":
    main()
