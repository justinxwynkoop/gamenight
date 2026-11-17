"""Draws the Family Game Night app icon, Top Shelf images and the two home
screen tiles (Singo Night, Jeopardy, Family Feud).

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
    save_tile(assets, "Tile-Feud", feud_tile)


if __name__ == "__main__":
    main()
