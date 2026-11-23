"""Draws the Family Game Night app icon, Top Shelf images and the two home
screen tiles (Singo Night, Jeopardy, Family Feud, Spy Night, Pie Chase).

`python3 Tools/make_app_art.py <Assets.xcassets> spynight [menu.webp]` draws only the Spy Night tile (and the website's menu picture);
`... piechase [menu.webp]` the same for Pie Chase.

Usage: python3 Tools/make_app_art.py FamilyGameNight/Assets.xcassets

Needs Pillow and the Bebas Neue font (BEBAS below). Reuses the drawing helpers in make_icon.py (the Singo Night art).
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


# ---------- Shared drawing helpers ----------

BEBAS = "/usr/share/fonts/opentype/bebas-neue/BebasNeue-Bold.otf"   # tall condensed capitals (apt: fonts-bebas-neue)


def vgrad(w, h, top, bottom):
    """A top-to-bottom gradient."""
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=mi.lerp(top, bottom, y / max(1, h - 1)))
    return img.convert("RGBA")


def radial(w, h, cx, cy, radius, color, strength):
    """A soft round glow centred at (cx, cy), as a transparent layer."""
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color + (int(255 * strength),))
    return layer.filter(ImageFilter.GaussianBlur(radius=radius * 0.45))


def gradient_text(layer, xy, text, font, top, bottom, anchor="mm", stroke=0, stroke_fill=(0, 0, 0, 255),
                  shadow=0.0, glow=None, spacing=0):
    """Letters filled with a vertical gradient, with an optional outline, a drop shadow and a glow."""
    w, h = layer.size
    if spacing:
        # Letter-spaced text: draw each letter, centred as a group.
        d0 = ImageDraw.Draw(layer)
        widths = [d0.textlength(ch, font=font) for ch in text]
        total = sum(widths) + spacing * (len(text) - 1)
        x = xy[0] - total / 2
        for ch, cw in zip(text, widths):
            gradient_text(layer, (x, xy[1]), ch, font, top, bottom, anchor="lm", stroke=stroke, stroke_fill=stroke_fill, shadow=shadow, glow=glow)
            x += cw + spacing
        return
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor=anchor)
    box = mask.getbbox()
    if not box:
        return
    x0, y0, x1, y1 = box
    outline = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(outline).text(xy, text, font=font, fill=stroke_fill, anchor=anchor, stroke_width=stroke)
    if glow:
        halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        halo.paste(Image.new("RGBA", (w, h), glow), (0, 0), outline.split()[3])
        layer.alpha_composite(halo.filter(ImageFilter.GaussianBlur(radius=max(4, font.size * 0.06))))
    if shadow:
        sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        sh.paste(Image.new("RGBA", (w, h), (0, 0, 0, 170)), (0, int(font.size * shadow)), outline.split()[3])
        layer.alpha_composite(sh.filter(ImageFilter.GaussianBlur(radius=max(2, font.size * 0.03))))
    if stroke:
        layer.alpha_composite(outline)
    fill = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill)
    for y in range(y0, y1 + 1):
        fd.line([(x0, y), (x1, y)], fill=mi.lerp(top, bottom, (y - y0) / max(1, y1 - y0)) + (255,))
    layer.paste(fill, (0, 0), mask)


def marquee(layer, y, count, h, margin=0.04):
    """A row of glowing warm light bulbs, like the edge of a game-show stage."""
    w = layer.size[0]
    r = h * 0.014
    glow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    xs = [w * margin + (w * (1 - 2 * margin)) * i / (count - 1) for i in range(count)]
    for x in xs:
        gd.ellipse([x - r * 2.6, y - r * 2.6, x + r * 2.6, y + r * 2.6], fill=(255, 190, 60, 120))
    layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=r * 2.2)))
    d = ImageDraw.Draw(layer)
    for x in xs:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 236, 160, 255))
        d.ellipse([x - r * 0.45, y - r * 0.55, x + r * 0.25, y + r * 0.15], fill=(255, 255, 240, 255))


def confetti(layer, seed, count, avoid=None):
    """Small paper confetti, placed from a fixed seed so every render matches."""
    import random
    rng = random.Random(seed)
    w, h = layer.size
    colors = [(249, 115, 22), (234, 179, 8), (59, 130, 246), (217, 70, 239), (20, 184, 166), (255, 201, 60), (244, 63, 94)]
    for _ in range(count):
        x, y = rng.random() * w, rng.random() * h
        if avoid and avoid[0] < x / w < avoid[1] and avoid[2] < y / h < avoid[3]:
            continue
        size = h * rng.uniform(0.014, 0.026)
        piece = Image.new("RGBA", (int(size * 3), int(size * 3)), (0, 0, 0, 0))
        pd = ImageDraw.Draw(piece)
        col = rng.choice(colors) + (235,)
        if rng.random() < 0.25:
            pd.ellipse([size, size, size * 2, size * 2], fill=col)
        else:
            pd.rounded_rectangle([size * 0.8, size * 0.5, size * 2.2, size * 2.5], radius=size * 0.2, fill=col)
        piece = piece.rotate(rng.uniform(0, 360), resample=Image.BICUBIC, expand=True)
        layer.alpha_composite(piece, (int(x - piece.width / 2), int(y - piece.height / 2)))


def beams(w, h, cx, cy, count=14, spread=70):
    """Soft spotlight beams fanning down from a point above the picture."""
    import math
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    reach = h * 1.6
    for i in range(count):
        a = math.radians(90 - spread / 2 + spread * i / (count - 1))
        half = math.radians(2.2)
        pts = [(cx, cy), (cx + reach * math.cos(a - half), cy + reach * math.sin(a - half)),
               (cx + reach * math.cos(a + half), cy + reach * math.sin(a + half))]
        d.polygon(pts, fill=(255, 235, 190, 26))
    return layer.filter(ImageFilter.GaussianBlur(radius=h * 0.012))


# ---------- Family Game Night icon and Top Shelf ----------

def fgn_back(w, h):
    img = vgrad(w, h, (20, 14, 70), (88, 36, 150))
    img.alpha_composite(radial(w, h, w * 0.5, h * 0.35, h * 0.75, (255, 160, 80), 0.28))
    img.alpha_composite(radial(w, h, w * 0.1, h * 1.0, h * 0.7, (59, 130, 246), 0.35))
    img.alpha_composite(radial(w, h, w * 0.95, h * 0.95, h * 0.6, (236, 72, 153), 0.30))
    img.alpha_composite(beams(w, h, w * 0.5, -h * 0.25))
    vignette = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(vignette).rectangle([0, 0, w, h], outline=(10, 6, 40, 150), width=int(h * 0.05))
    img.alpha_composite(vignette.filter(ImageFilter.GaussianBlur(radius=h * 0.06)))
    return img.convert("RGB")


def fgn_middle(w, h, wide=False):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    marquee(layer, h * 0.075, 17 if wide else 13, h)
    marquee(layer, h * 0.925, 17 if wide else 13, h)
    if wide:
        confetti(layer, 7, 46, avoid=(0.2, 0.8, 0.22, 0.82))
        mi.draw_ball(layer, 0.11 * w, 0.40 * h, 0.17 * h, mi.BALL_COLORS[0], "♪")
        mi.draw_ball(layer, 0.89 * w, 0.62 * h, 0.15 * h, mi.BALL_COLORS[2], "♫")
        board_tile(layer, 0.88 * w, 0.26 * h, 0.12 * w, 0.2 * h, 8, "$", h)
        board_tile(layer, 0.12 * w, 0.78 * h, 0.1 * w, 0.17 * h, -9, "$", h)
    else:
        confetti(layer, 11, 30, avoid=(0.24, 0.76, 0.18, 0.82))
        mi.draw_ball(layer, 0.13 * w, 0.40 * h, 0.15 * h, mi.BALL_COLORS[0], "♪")
        mi.draw_ball(layer, 0.87 * w, 0.62 * h, 0.13 * h, mi.BALL_COLORS[2], "♫")
        board_tile(layer, 0.86 * w, 0.27 * h, 0.17 * w, 0.2 * h, 8, "$", h)
        board_tile(layer, 0.14 * w, 0.78 * h, 0.15 * w, 0.18 * h, -9, "$", h)
    return layer


def fgn_front(w, h, big=0.30, small=0.075):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cx = w / 2
    small_font = ImageFont.truetype(mi.SUB_FONT, int(small * h))
    big_font = ImageFont.truetype(BEBAS, int(big * h))
    gradient_text(layer, (cx, h * 0.225), "FAMILY", small_font, (255, 255, 255), (214, 206, 255),
                  shadow=0.08, spacing=small * h * 0.55)
    # GAME in white-lavender, NIGHT in gold: two lines, tightly stacked, with an outline for depth.
    gradient_text(layer, (cx, h * 0.46), "GAME", big_font, (255, 255, 255), (206, 198, 255), stroke=int(h * 0.012),
                  stroke_fill=(38, 16, 96, 255), shadow=0.05, glow=(255, 255, 255, 70))
    gradient_text(layer, (cx, h * 0.72), "NIGHT", big_font, (255, 236, 130), (255, 160, 24), stroke=int(h * 0.012),
                  stroke_fill=(104, 44, 4, 255), shadow=0.05, glow=(255, 190, 60, 120))
    return layer


def fgn_flat(w, h, wide=False):
    img = fgn_back(w, h).convert("RGBA")
    img.alpha_composite(fgn_middle(w, h, wide))
    img.alpha_composite(fgn_front(w, h, 0.34 if wide else 0.30, 0.085 if wide else 0.075))
    return img.convert("RGB")


# ---------- Home screen tiles ----------

def singo_tile(w, h):
    """Song bingo: a bingo card with S-I-N-G-O across the top, big title, glowing bingo balls."""
    img = vgrad(w, h, (122, 34, 176), (38, 18, 112))
    img.alpha_composite(radial(w, h, w * 0.2, h * 0.15, h * 0.8, (255, 90, 170), 0.34))
    img.alpha_composite(radial(w, h, w * 0.9, h * 0.95, h * 0.8, (70, 130, 255), 0.36))

    # The card: a header row of coloured S-I-N-G-O tiles, then rows of notes, with a gold star in the middle.
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cols, rows = 5, 6
    gap = h * 0.016
    mx, my = w * 0.07, h * 0.05
    cw = (w - 2 * mx - gap * (cols - 1)) / cols
    ch = (h - 2 * my - gap * (rows - 1)) / rows
    cd.rounded_rectangle([mx - gap, my - gap, w - mx + gap, h - my + gap], radius=h * 0.03, fill=(18, 6, 56, 235))
    letter_font = ImageFont.truetype(BEBAS, int(ch * 0.78))
    note_font = ImageFont.truetype(mi.NOTE_FONT, int(ch * 0.5))
    for r in range(rows):
        for c in range(cols):
            x, y = mx + c * (cw + gap), my + r * (ch + gap)
            box = [x, y, x + cw, y + ch]
            if r == 0:
                col = mi.BALL_COLORS[c % len(mi.BALL_COLORS)]
                cd.rounded_rectangle(box, radius=h * 0.016, fill=col + (255,))
                cd.text((x + cw / 2, y + ch / 2 + h * 0.004), "SINGO"[c], font=letter_font, fill=(255, 255, 255, 255), anchor="mm")
            elif (r, c) == (3, 2):
                cd.rounded_rectangle(box, radius=h * 0.016, fill=(255, 196, 40, 70))
                cd.text((x + cw / 2, y + ch / 2), "★", font=note_font, fill=(255, 210, 70, 255), anchor="mm")
            else:
                cd.rounded_rectangle(box, radius=h * 0.016, fill=(255, 255, 255, 30))
                cd.text((x + cw / 2, y + ch / 2), "♪♫"[(r + c) % 2], font=note_font, fill=(255, 255, 255, 105), anchor="mm")
    img.alpha_composite(card)

    # Darken the middle so the title reads.
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle([-w * 0.02, h * 0.31, w * 1.02, h * 0.77], radius=h * 0.12, fill=(20, 6, 70, 232))
    img.alpha_composite(shade.filter(ImageFilter.GaussianBlur(radius=h * 0.05)))

    # Bingo balls tumbling in from the corners.
    balls = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Kept to the bottom corners so the S-I-N-G-O header stays clear.
    mi.draw_ball(balls, 0.075 * w, 0.855 * h, 0.14 * h, mi.BALL_COLORS[0], "♪")
    mi.draw_ball(balls, 0.925 * w, 0.865 * h, 0.14 * h, mi.BALL_COLORS[1], "♫")
    mi.draw_ball(balls, 0.215 * w, 0.915 * h, 0.075 * h, mi.BALL_COLORS[3], "♫")
    mi.draw_ball(balls, 0.80 * w, 0.93 * h, 0.07 * h, mi.BALL_COLORS[2], "♪")
    img.alpha_composite(balls)

    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    title_font = ImageFont.truetype(BEBAS, int(h * 0.36))
    gradient_text(front, (w / 2, h * 0.505), "SINGO NIGHT", title_font, (255, 255, 255), (214, 196, 255),
                  stroke=int(h * 0.011), stroke_fill=(52, 14, 110, 255), shadow=0.035, glow=(255, 150, 220, 150))
    tag_font = ImageFont.truetype(mi.SUB_FONT, int(h * 0.058))
    gradient_text(front, (w / 2, h * 0.685), "NAME THAT SONG", tag_font, (255, 224, 110), (255, 178, 40),
                  shadow=0.06, spacing=h * 0.03)
    img.alpha_composite(front)
    return img.convert("RGB")


def jeopardy_tile(w, h):
    """The classic quiz-show board: vivid blue, gold dollar amounts, big silver-white title."""
    img = vgrad(w, h, (34, 62, 236), (8, 18, 140))
    img.alpha_composite(radial(w, h, w * 0.5, h * 0.2, h * 0.85, (120, 170, 255), 0.32))

    # The board: a grid of blue tiles with dark gaps, each with a gold dollar value.
    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    cols, rows = 6, 5
    gap = h * 0.014
    mx, my = w * 0.03, h * 0.05
    cw = (w - 2 * mx - gap * (cols - 1)) / cols
    ch = (h - 2 * my - gap * (rows - 1)) / rows
    gd.rectangle([mx - gap, my - gap, w - mx + gap, h - my + gap], fill=(2, 4, 40, 255))
    value_font = ImageFont.truetype(BEBAS, int(ch * 0.62))
    for r in range(rows):
        for c in range(cols):
            x, y = mx + c * (cw + gap), my + r * (ch + gap)
            tile = vgrad(int(cw), int(ch), (30, 56, 226), (12, 28, 170))
            grid.paste(tile, (int(x), int(y)))
            gd.line([(x, y + 1), (x + cw, y + 1)], fill=(110, 140, 255, 150), width=max(1, int(h * 0.004)))
            label = f"${(r + 1) * 200}"
            sx, sy = x + cw / 2, y + ch / 2
            gd.text((sx + h * 0.006, sy + h * 0.008), label, font=value_font, fill=(0, 0, 20, 200), anchor="mm")
            gd.text((sx, sy), label, font=value_font, fill=(255, 205, 64, 255), anchor="mm")
    img.alpha_composite(grid)

    # Darken the middle so the title reads, then draw it.
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle([-w * 0.02, h * 0.25, w * 1.02, h * 0.81], radius=h * 0.12, fill=(2, 6, 72, 238))
    img.alpha_composite(shade.filter(ImageFilter.GaussianBlur(radius=h * 0.05)))

    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    title_font = ImageFont.truetype(BEBAS, int(h * 0.40))
    gradient_text(front, (w / 2, h * 0.47), "JEOPARDY!", title_font, (255, 255, 255), (178, 190, 228),
                  stroke=int(h * 0.011), stroke_fill=(6, 12, 110, 255), shadow=0.035, glow=(130, 170, 255, 150))
    tag_font = ImageFont.truetype(mi.SUB_FONT, int(h * 0.062))
    gradient_text(front, (w / 2, h * 0.705), "FAMILY EDITION", tag_font, (255, 224, 110), (255, 178, 40),
                  shadow=0.06, spacing=h * 0.034)
    img.alpha_composite(front)
    return img.convert("RGB")


def feud_tile(w, h):
    """A game-show stage: deep blue with spotlight beams, a frame of light bulbs, a big gold FEUD and a red banner."""
    img = vgrad(w, h, (24, 52, 206), (6, 12, 86))
    img.alpha_composite(radial(w, h, w * 0.5, h * 0.42, h * 0.8, (120, 170, 255), 0.30))

    # Spotlight beams fanning out from the top middle.
    beams = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beams)
    import math
    for k in range(-5, 6):
        a0, a1 = math.radians(90 + k * 15 - 3.2), math.radians(90 + k * 15 + 3.2)
        r = w * 1.4
        bd.polygon([(w / 2, -h * 0.1), (w / 2 + r * math.cos(a0), -h * 0.1 + r * math.sin(a0)), (w / 2 + r * math.cos(a1), -h * 0.1 + r * math.sin(a1))], fill=(255, 255, 255, 22))
    img.alpha_composite(beams.filter(ImageFilter.GaussianBlur(radius=h * 0.012)))

    # The frame of bulbs: gold rail, then bulbs all the way round.
    frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    m = h * 0.055
    fd.rounded_rectangle([m, m, w - m, h - m], radius=h * 0.05, outline=(255, 205, 70, 255), width=max(3, int(h * 0.012)))
    img.alpha_composite(frame)
    r = h * 0.017
    bulbs = []
    nx, ny = 22, 12
    for i in range(nx):
        x = m + (w - 2 * m) * i / (nx - 1)
        bulbs += [(x, m), (x, h - m)]
    for j in range(1, ny - 1):
        y = m + (h - 2 * m) * j / (ny - 1)
        bulbs += [(m, y), (w - m, y)]
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for x, y in bulbs:
        gd.ellipse([x - r * 2.4, y - r * 2.4, x + r * 2.4, y + r * 2.4], fill=(255, 190, 60, 110))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=r * 2)))
    bl = ImageDraw.Draw(img)
    for x, y in bulbs:
        bl.ellipse([x - r, y - r, x + r, y + r], fill=(255, 238, 170, 255))
        bl.ellipse([x - r * 0.45, y - r * 0.55, x + r * 0.25, y + r * 0.15], fill=(255, 255, 245, 255))

    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    small = ImageFont.truetype(BEBAS, int(h * 0.19))
    gradient_text(front, (w / 2, h * 0.235), "FAMILY", small, (255, 255, 255), (184, 198, 240),
                  stroke=int(h * 0.008), stroke_fill=(10, 20, 120, 255), shadow=0.03, spacing=h * 0.05)
    big = ImageFont.truetype(BEBAS, int(h * 0.50))
    gradient_text(front, (w / 2, h * 0.565), "FEUD", big, (255, 241, 150), (245, 168, 20),
                  stroke=int(h * 0.016), stroke_fill=(120, 14, 22, 255), shadow=0.035, glow=(255, 190, 70, 170), spacing=h * 0.012)
    # A red banner, like a strike box turned sideways.
    banner = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bw, bh = w * 0.50, h * 0.115
    bx0, by0 = w / 2 - bw / 2, h * 0.795
    ImageDraw.Draw(banner).rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=bh * 0.32, fill=(214, 36, 46, 255), outline=(255, 190, 190, 255), width=max(3, int(h * 0.007)))
    sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), (0, int(h * 0.012)), banner.split()[3])
    front.alpha_composite(sh.filter(ImageFilter.GaussianBlur(radius=h * 0.012)))
    front.alpha_composite(banner)
    tag = ImageFont.truetype(mi.SUB_FONT, int(h * 0.058))
    gradient_text(front, (w / 2, by0 + bh / 2), "SURVEY SAYS", tag, (255, 255, 255), (255, 225, 225), spacing=h * 0.03)
    img.alpha_composite(front)
    return img.convert("RGB")


def spy_tile(w, h):
    """Spy Night: a night-time silhouette in a fedora and dark glasses, teal on one side and red on the other (the two sides of the game)."""
    import math
    img = vgrad(w, h, (20, 28, 62), (6, 8, 22))
    img.alpha_composite(radial(w, h, w * 0.12, h * 0.55, h * 0.9, (56, 214, 196), 0.34))
    img.alpha_composite(radial(w, h, w * 0.88, h * 0.55, h * 0.9, (255, 77, 94), 0.36))

    # City skyline, far away.
    sky = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sky)
    import random
    rng = random.Random(7)
    x = 0
    while x < w:
        bw = rng.uniform(0.04, 0.09) * w
        bh = rng.uniform(0.12, 0.34) * h
        sd.rectangle([x, h * 0.72 - bh, x + bw, h], fill=(10, 14, 34, 255))
        for wy in range(int(h * 0.72 - bh + h * 0.03), int(h * 0.72), int(h * 0.05)):
            for wx in range(int(x + bw * 0.15), int(x + bw * 0.85), int(w * 0.018)):
                if rng.random() < 0.22:
                    sd.rectangle([wx, wy, wx + w * 0.008, wy + h * 0.02], fill=(255, 214, 120, 150))
        x += bw + w * 0.004
    img.alpha_composite(sky)

    # A spotlight cone down onto the figure.
    cone = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(cone).polygon([(w * 0.47, -h * 0.05), (w * 0.53, -h * 0.05), (w * 0.72, h * 0.8), (w * 0.28, h * 0.8)], fill=(255, 255, 255, 34))
    img.alpha_composite(cone.filter(ImageFilter.GaussianBlur(radius=h * 0.02)))

    fig = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fig)
    cx = w / 2
    ink = (4, 6, 16, 255)
    # Coat and shoulders, a pale shirt collar and a tie.
    fd.polygon([(cx - w * 0.19, h * 0.74), (cx - w * 0.15, h * 0.52), (cx - w * 0.06, h * 0.45), (cx + w * 0.06, h * 0.45), (cx + w * 0.15, h * 0.52), (cx + w * 0.19, h * 0.74)], fill=ink)
    fd.polygon([(cx - w * 0.06, h * 0.45), (cx, h * 0.62), (cx + w * 0.06, h * 0.45), (cx + w * 0.025, h * 0.43), (cx - w * 0.025, h * 0.43)], fill=(226, 232, 248, 255))
    fd.polygon([(cx - w * 0.012, h * 0.5), (cx + w * 0.012, h * 0.5), (cx + w * 0.02, h * 0.68), (cx, h * 0.72), (cx - w * 0.02, h * 0.68)], fill=(214, 36, 56, 255))
    fd.polygon([(cx - w * 0.06, h * 0.45), (cx - w * 0.015, h * 0.55), (cx - w * 0.13, h * 0.6), (cx - w * 0.15, h * 0.52)], fill=ink)
    fd.polygon([(cx + w * 0.06, h * 0.45), (cx + w * 0.015, h * 0.55), (cx + w * 0.13, h * 0.6), (cx + w * 0.15, h * 0.52)], fill=ink)
    # Head: a plain dark oval, because nobody should know who this is.
    fd.ellipse([cx - w * 0.075, h * 0.2, cx + w * 0.075, h * 0.46], fill=(14, 18, 40, 255))
    # Dark glasses with a glint.
    gy = h * 0.335
    for gx in (cx - w * 0.036, cx + w * 0.036):
        fd.rounded_rectangle([gx - w * 0.03, gy - h * 0.026, gx + w * 0.03, gy + h * 0.03], radius=h * 0.014, fill=(0, 0, 0, 255), outline=(120, 140, 200, 255), width=max(2, int(h * 0.004)))
        fd.line([(gx - w * 0.02, gy - h * 0.012), (gx - w * 0.006, gy - h * 0.012)], fill=(190, 210, 255, 220), width=max(2, int(h * 0.006)))
    fd.line([(cx - w * 0.006, gy - h * 0.005), (cx + w * 0.006, gy - h * 0.005)], fill=(120, 140, 200, 255), width=max(2, int(h * 0.004)))
    # The fedora: crown, band and a wide brim tilted a little.
    fd.polygon([(cx - w * 0.07, h * 0.255), (cx - w * 0.055, h * 0.1), (cx + w * 0.055, h * 0.1), (cx + w * 0.07, h * 0.255)], fill=ink)
    fd.polygon([(cx - w * 0.069, h * 0.235), (cx + w * 0.069, h * 0.235), (cx + w * 0.07, h * 0.255), (cx - w * 0.07, h * 0.255)], fill=(214, 36, 56, 255))
    fd.ellipse([cx - w * 0.13, h * 0.235, cx + w * 0.13, h * 0.285], fill=ink)
    img.alpha_composite(fig.rotate(-3, center=(cx, h * 0.5), resample=Image.BICUBIC))

    # Question marks drifting around: who is the Spy?
    q = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    qf = ImageFont.truetype(BEBAS, int(h * 0.26))
    gradient_text(q, (w * 0.14, h * 0.3), "?", qf, (150, 255, 236), (56, 214, 196), shadow=0.02, glow=(56, 214, 196, 130))
    gradient_text(q, (w * 0.86, h * 0.27), "?", qf, (255, 170, 178), (255, 77, 94), shadow=0.02, glow=(255, 77, 94, 130))
    img.alpha_composite(q)

    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle([-w * 0.02, h * 0.66, w * 1.02, h * 1.02], radius=h * 0.1, fill=(3, 5, 18, 225))
    img.alpha_composite(shade.filter(ImageFilter.GaussianBlur(radius=h * 0.04)))
    title_font = ImageFont.truetype(BEBAS, int(h * 0.30))
    gradient_text(front, (w / 2, h * 0.77), "SPY NIGHT", title_font, (255, 255, 255), (196, 208, 240),
                  stroke=int(h * 0.01), stroke_fill=(10, 12, 40, 255), shadow=0.03, glow=(120, 150, 255, 130), spacing=h * 0.012)
    tag_font = ImageFont.truetype(mi.SUB_FONT, int(h * 0.055))
    gradient_text(front, (w / 2, h * 0.92), "WHO CAN YOU TRUST?", tag_font, (255, 224, 110), (255, 178, 40), shadow=0.06, spacing=h * 0.03)
    img.alpha_composite(front)
    return img.convert("RGB")


PIE_COLORS = [(59, 130, 246), (236, 72, 153), (250, 204, 21), (168, 85, 247), (34, 197, 94), (249, 115, 22)]
APP_FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "FamilyGameNight", "GameNight", "Fonts")


def pie_tile(w, h):
    """Pie Chase: the wheel board seen from above, a token with four of its six wedges, and the title. Uses the app's
    own fonts (Unbounded, Outfit), so it draws anywhere."""
    import math
    img = vgrad(w, h, (22, 34, 84), (8, 11, 28))
    for (fx, fy, col, st) in ((0.2, 0.2, (59, 130, 246), 0.35), (0.85, 0.25, (236, 72, 153), 0.3), (0.75, 0.9, (249, 115, 22), 0.25), (0.15, 0.85, (34, 197, 94), 0.25)):
        img.alpha_composite(radial(w, h, w * fx, h * fy, h * 0.7, col, st))
    ss = 3   # drawn bigger, then shrunk, for smooth edges
    W, H = w * ss, h * ss
    board = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(board)
    cx, cy, R = W * 0.5, H * 0.42, H * 0.36
    d.ellipse([cx - R * 1.13, cy - R * 1.13, cx + R * 1.13, cy + R * 1.13], fill=(13, 20, 40, 255), outline=(40, 52, 96, 255), width=int(H * 0.004))
    ring = [None] * 42
    pat = [2, None, 4, 3, None, 5]
    for n in range(42):
        k, off = divmod(n, 7)
        ring[n] = ("hq", k) if off == 0 else (("again", None) if pat[off - 1] is None else ("cat", (k + pat[off - 1]) % 6))
    band = R * 0.15
    for n, (kind, c) in enumerate(ring):
        a0 = -90 + (n - 0.5) * 360 / 42 + 0.5
        a1 = -90 + (n + 0.5) * 360 / 42 - 0.5
        col = PIE_COLORS[c] + (255,) if c is not None else (27, 34, 56, 255)
        d.pieslice([cx - R - band / 2, cy - R - band / 2, cx + R + band / 2, cy + R + band / 2], a0, a1, fill=col)
    d.ellipse([cx - R + band / 2 + 6, cy - R + band / 2 + 6, cx + R - band / 2 - 6, cy + R - band / 2 - 6], fill=(18, 27, 54, 255))
    spoke = [5, 2, 4, 1, 3]
    for k in range(6):
        a = math.radians(-90 + 60 * k)
        for i in range(1, 6):
            r = R * (0.17 + i * 0.83 / 6)
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
            s = R * 0.062
            d.rounded_rectangle([x - s, y - s, x + s, y + s], radius=s * 0.3, fill=PIE_COLORS[(k + spoke[i - 1]) % 6] + (255,))
        x, y = cx + math.cos(a) * R, cy + math.sin(a) * R
        d.ellipse([x - R * 0.12, y - R * 0.12, x + R * 0.12, y + R * 0.12], fill=PIE_COLORS[k] + (255,), outline=(255, 255, 255, 255), width=int(R * 0.022))
    hexa = [(cx + math.cos(math.radians(-60 + 60 * i)) * R * 0.17, cy + math.sin(math.radians(-60 + 60 * i)) * R * 0.17) for i in range(6)]
    d.polygon(hexa, fill=(16, 22, 38, 255), outline=(255, 255, 255, 255), width=int(R * 0.02))
    for i in range(6):
        d.pieslice([cx - R * 0.1, cy - R * 0.1, cx + R * 0.1, cy + R * 0.1], -90 + 60 * i, -30 + 60 * i, fill=PIE_COLORS[i] + (230,))
    # A big token, tilted, in front: four wedges won, two to go.
    tok = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(tok)
    tx, ty, tr = W * 0.79, H * 0.44, H * 0.2
    td.ellipse([tx - tr * 1.1, ty - tr * 1.1 + tr * 0.12, tx + tr * 1.1, ty + tr * 1.1 + tr * 0.12], fill=(0, 0, 0, 150))
    td.ellipse([tx - tr * 1.1, ty - tr * 1.1, tx + tr * 1.1, ty + tr * 1.1], fill=(245, 247, 255, 255))
    td.ellipse([tx - tr, ty - tr, tx + tr, ty + tr], fill=(12, 16, 32, 255))
    for i in (0, 1, 2, 4):
        td.pieslice([tx - tr * 0.92, ty - tr * 0.92, tx + tr * 0.92, ty + tr * 0.92], -90 + 60 * i + 2, -30 + 60 * i - 2, fill=PIE_COLORS[i] + (255,))
    board.alpha_composite(tok.filter(ImageFilter.GaussianBlur(radius=1)))
    # A die, top left.
    dd = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ddd = ImageDraw.Draw(dd)
    dx, dy, ds = W * 0.2, H * 0.36, H * 0.12
    ddd.rounded_rectangle([dx - ds, dy - ds + ds * 0.15, dx + ds, dy + ds + ds * 0.15], radius=ds * 0.35, fill=(0, 0, 0, 140))
    ddd.rounded_rectangle([dx - ds, dy - ds, dx + ds, dy + ds], radius=ds * 0.35, fill=(255, 255, 255, 255))
    for px, py in ((-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)):
        pr = ds * 0.17
        ddd.ellipse([dx + px * ds * 0.55 - pr, dy + py * ds * 0.55 - pr, dx + px * ds * 0.55 + pr, dy + py * ds * 0.55 + pr], fill=(17, 24, 39, 255))
    board.alpha_composite(dd.rotate(14, center=(dx, dy), resample=Image.BICUBIC))
    img.alpha_composite(board.resize((w, h), Image.LANCZOS))
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle([-w * 0.02, h * 0.7, w * 1.02, h * 1.02], radius=h * 0.1, fill=(4, 6, 20, 225))
    img.alpha_composite(shade.filter(ImageFilter.GaussianBlur(radius=h * 0.04)))
    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    title_font = ImageFont.truetype(os.path.join(APP_FONTS, "Unbounded-Black.ttf"), int(h * 0.15))
    gradient_text(front, (w / 2, h * 0.8), "PIE CHASE", title_font, (255, 255, 255), (214, 222, 245),
                  stroke=int(h * 0.008), stroke_fill=(10, 12, 40, 255), shadow=0.04, glow=(140, 120, 255, 120))
    tag_font = ImageFont.truetype(os.path.join(APP_FONTS, "Outfit-ExtraBold.ttf"), int(h * 0.058))
    gradient_text(front, (w / 2, h * 0.925), "COLLECT ALL SIX WEDGES", tag_font, (255, 224, 110), (255, 178, 40), shadow=0.06, spacing=h * 0.012)
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
    if len(sys.argv) > 2 and sys.argv[2] == "spynight":
        # Only the Spy Night tile (and its picture for the website's menu), leaving the other art untouched.
        save_tile(assets, "Tile-SpyNight", spy_tile)
        if len(sys.argv) > 3:
            spy_tile(840, 504).save(sys.argv[3], quality=88)
        return
    if len(sys.argv) > 2 and sys.argv[2] == "piechase":
        # Only the Pie Chase tile (and its picture for the website's menu).
        save_tile(assets, "Tile-PieChase", pie_tile)
        if len(sys.argv) > 3:
            pie_tile(840, 504).save(sys.argv[3], quality=88)
        return
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
    save_tile(assets, "Tile-Feud", feud_tile)


if __name__ == "__main__":
    main()
