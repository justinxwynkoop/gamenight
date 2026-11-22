"""Writes Spy Night's and Family Feud's own sounds: a noir-ish lobby loop and one sound for each moment of the game.

Everything is synthesized here from plain waves, so it is original (CC0, like the rest of the built-in sounds) and there
is nothing to license. Usage, from the repository root (needs ffmpeg):

    python3 tv-app/Tools/make_spynight_sounds.py [spynight|feud] [names...]

It writes public/builtin-sounds/<game>/<name>.mp3 (the website's TV page) and
tv-app/FamilyGameNight/GameNight/Sounds/<game>__<name>.m4a (the Apple TV app). The two copies are the same sounds.
Family Feud gets three: lobby (its theme tune), ding (a right answer) and faceoff (the buzzer).
Spy Night's names are the ones the game's cues use (the same as the other games' files, see games/spynight/ and docs/PLAYING.md):
  lobby       music loop while players join          roundstart  the roles are dealt
  pick        a leader starts picking a team          open        the vote begins
  correct     a team is approved                      wrong       a team is rejected
  lock        the mission begins                      ding        a mission succeeds
  strike      a mission fails                         fanfare     the Resistance win
  winner      the Spies win                           join        a player joins
"""
import math
import os
import random
import struct
import subprocess
import sys
import tempfile

SR = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MP3_DIR = os.path.join(ROOT, "public", "builtin-sounds", "spynight")
M4A_DIR = os.path.join(ROOT, "tv-app", "FamilyGameNight", "GameNight", "Sounds")


def hz(note):
    """MIDI note number to frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    """'A3' -> 57, 'G#4' -> 68, 'Bb2' -> 46."""
    n = NOTE[name[0]]
    i = 1
    while name[i] in "#b":
        n += 1 if name[i] == "#" else -1
        i += 1
    return n + 12 * (int(name[i:]) + 1)


class Track:
    """A mono buffer of floats that notes and noises are mixed into."""

    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.x = [0.0] * self.n

    def add(self, start, samples, gain=1.0):
        i0 = int(start * SR)
        for i, s in enumerate(samples):
            j = i0 + i
            if 0 <= j < self.n:
                self.x[j] += s * gain


def env(n, attack, decay, sustain=0.0, release=0.02, hold=None):
    """An envelope n samples long: attack, decay to `sustain`, held until the release at the end."""
    a, d, r = max(1, int(attack * SR)), max(1, int(decay * SR)), max(1, int(release * SR))
    out = []
    for i in range(n):
        if i < a:
            v = i / a
        elif i < a + d:
            v = 1 - (1 - sustain) * ((i - a) / d)
        else:
            v = sustain
        left = n - i
        if left < r:
            v *= left / r
        out.append(v)
    return out


def wave(kind, f, t, ph=0.0):
    p = (f * t + ph) % 1.0
    if kind == "sine":
        return math.sin(2 * math.pi * p)
    if kind == "tri":
        return 4 * abs(p - 0.5) - 1
    if kind == "square":
        return 1.0 if p < 0.5 else -1.0
    if kind == "saw":
        return 2 * p - 1
    raise ValueError(kind)


def tone(f, dur, kind="sine", attack=0.005, decay=0.2, sustain=0.0, release=0.03, vibrato=0.0, slide=None, harmonics=None):
    """One note. `slide` ends at another pitch; `harmonics` is a list of (multiple, gain) added on top (bells, brass)."""
    n = int(dur * SR)
    e = env(n, attack, decay, sustain, release)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        freq = f if slide is None else f + (slide - f) * (i / n)
        if vibrato:
            freq *= 1 + 0.004 * math.sin(2 * math.pi * vibrato * t)
        phase += freq / SR
        v = wave(kind, 1.0, phase)
        for mult, g in harmonics or []:
            v += g * wave("sine", 1.0, phase * mult)
        out.append(v * e[i])
    return out


def noise(dur, seed=1, attack=0.002, decay=0.1, lowpass=None, highpass=None):
    rng = random.Random(seed)
    n = int(dur * SR)
    e = env(n, attack, decay, 0.0, 0.005)
    out, lp, hp_prev, hp_out = [], 0.0, 0.0, 0.0
    for i in range(n):
        v = rng.uniform(-1, 1)
        if lowpass:
            lp += lowpass * (v - lp)
            v = lp
        if highpass:
            hp_out = highpass * (hp_out + v - hp_prev)
            hp_prev = v
            v = hp_out
        out.append(v * e[i])
    return out


def lowpass(samples, a):
    y, out = 0.0, []
    for s in samples:
        y += a * (s - y)
        out.append(y)
    return out


def echo(x, delay, feedback, mix=0.3, taps=3):
    """A few decaying repeats: a little room around a dry sound."""
    d = int(delay * SR)
    out = x[:]
    for k in range(1, taps + 1):
        g = mix * (feedback ** (k - 1))
        for i in range(len(x) - d * k):
            out[i + d * k] += x[i] * g
    return out


def room(x, wet=0.22):
    """A cheap small-room reverb from four short feedback combs."""
    out = x[:]
    for delay, fb in ((0.0297, 0.55), (0.0371, 0.5), (0.0411, 0.45), (0.0437, 0.4)):
        d = int(delay * SR)
        buf = [0.0] * len(x)
        for i in range(len(x)):
            buf[i] = x[i] + (buf[i - d] * fb if i >= d else 0.0)
        for i in range(len(x)):
            out[i] += buf[i] * wet * 0.35
    return out


def normalize(x, peak=0.85):
    m = max(1e-9, max(abs(s) for s in x))
    return [s * peak / m for s in x]


def fade_edges(x, ms=4):
    n = int(ms / 1000 * SR)
    for i in range(min(n, len(x))):
        x[i] *= i / n
        x[-1 - i] *= i / n
    return x


def bell(f, dur, gain=1.0):
    """A soft bell: a sine with a few inharmonic partials."""
    return tone(f, dur, "sine", 0.002, dur * 0.9, 0.0, 0.03, harmonics=[(2.01, 0.5), (3.02, 0.25), (4.2, 0.12), (5.4, 0.06)])


def pluck(f, dur=0.5, bright=0.5):
    """A plucked string-ish note: a saw through a lowpass that closes quickly."""
    n = int(dur * SR)
    out = []
    phase = 0.0
    lp = 0.0
    for i in range(n):
        phase += f / SR
        v = wave("saw", 1.0, phase) * 0.6 + wave("square", 1.0, phase) * 0.4
        cutoff = 0.04 + bright * 0.5 * math.exp(-i / (SR * 0.07))
        lp += cutoff * (v - lp)
        out.append(lp * math.exp(-i / (SR * dur * 0.45)))
    return fade_edges(out, 3)


def kick(dur=0.35, f0=120, f1=42):
    n = int(dur * SR)
    out, ph = [], 0.0
    for i in range(n):
        f = f1 + (f0 - f1) * math.exp(-i / (SR * 0.04))
        ph += f / SR
        out.append(math.sin(2 * math.pi * ph) * math.exp(-i / (SR * 0.12)))
    return out


def hat(seed, dur=0.05, gain=1.0):
    return [s * gain for s in noise(dur, seed, 0.001, dur * 0.8, highpass=0.93)]


# ---------------------------------------------------------------- the music

def lobby():
    """Eight bars of slinky A-minor noir at 100 beats a minute, played twice with a different tune the second time,
    then wrapped so the end flows straight back into the start."""
    bpm = 100
    beat = 60 / bpm
    bars = 16
    length = bars * 4 * beat
    tail = 2.5
    t = Track(length + tail)
    # Bass: root-fifth-octave walk on each chord.
    chords = ["A", "A", "D", "E", "A", "F", "D", "E"]
    roots = {"A": 33, "D": 38, "E": 40, "F": 29}   # A1 D2 E2 F1
    for bar in range(bars):
        c = chords[bar % 8]
        r = roots[c]
        pat = [(0, r), (1.5, r + 7), (2, r + 12), (3, r + 7), (3.5, r + 10 if c in ("A", "D") else r + 11)]
        for b, n in pat:
            s = (bar * 4 + b) * beat
            t.add(s, pluck(hz(n), 0.45, 0.35), 0.5)
        # Hats: the ticking of a watch, the second beat and offbeats.
        for k in range(8):
            t.add((bar * 4 + k * 0.5) * beat, hat(bar * 8 + k, 0.04), 0.1 if k % 2 else 0.17)
        if bar % 2 == 0:
            t.add((bar * 4 + 0) * beat, kick(), 0.5)
            t.add((bar * 4 + 2) * beat, kick(0.3, 110, 45), 0.35)
        # Soft pad: the chord, a long triangle with slow attack.
        third = {"A": 3, "D": 3, "E": 4, "F": 4}[c]
        for n in (r + 24, r + 24 + third, r + 24 + 7):
            t.add(bar * 4 * beat, tone(hz(n), 4 * beat, "tri", 0.4, 1.0, 0.5, 0.5), 0.07)
    # The tune: sparse and a little sinister. Eight bars, then a variation. (beat, note, length in beats)
    tune_a = [(0, "A4", 1.5), (2, "C5", 1), (3, "B4", 1), (4, "A4", 1.5), (6, "E5", 1), (7, "D5", 1),
              (8, "D5", 1.5), (10, "F5", 1), (11, "E5", 1), (12, "G#4", 2), (14.5, "B4", 1.5),
              (16, "A4", 1.5), (18, "C5", 1), (19, "E5", 1), (20, "F5", 2), (22, "E5", 1), (23, "C5", 1),
              (24, "D5", 1.5), (26, "C5", 1), (27, "A4", 1), (28, "G#4", 1.5), (30, "E4", 2)]
    tune_b = [(0, "E5", 1), (1, "E5", 0.5), (2, "A5", 1.5), (4, "G5", 1), (5, "E5", 1), (6, "C5", 2),
              (8, "D5", 1), (9, "F5", 1), (10, "A5", 1.5), (12, "G#5", 1), (13, "E5", 1), (14, "B4", 2),
              (16, "A4", 1), (17, "C5", 1), (18, "E5", 1), (19, "A5", 1), (20, "F5", 1.5), (22, "D5", 1), (23, "F5", 1),
              (24, "E5", 1.5), (26, "D5", 1), (27, "C5", 1), (28, "B4", 1), (29, "G#4", 1), (30, "A4", 2)]
    for part, tune in enumerate((tune_a, tune_b)):
        for b, name, ln in tune:
            s = (part * 32 + b) * beat
            note = bell(hz(midi(name)), ln * beat + 0.4)
            t.add(s, note, 0.16)
    # A low string-ish swell at the start of each 8-bar phrase.
    for part in range(2):
        t.add(part * 32 * beat, tone(hz(45), 8 * beat, "saw", 1.2, 1.5, 0.4, 0.8, vibrato=4.5), 0.04)
    x = room(t.x, 0.35)
    # Wrap the tail round to the start so the loop has no gap.
    body = x[: int(length * SR)]
    for i, s in enumerate(x[int(length * SR):]):
        if i < len(body):
            body[i] += s
    return normalize(body, 0.9)


# ---------------------------------------------------------------- the moments

def deal():
    """The roles are dealt: a flick of cards, a low hit and a rising minor sting."""
    t = Track(1.6)
    for k in range(7):
        t.add(k * 0.055, noise(0.05, 10 + k, 0.001, 0.04, highpass=0.88), 0.55)
    t.add(0.42, kick(0.6, 90, 36), 0.9)
    for i, n in enumerate(("A3", "C4", "E4")):
        t.add(0.45 + i * 0.09, pluck(hz(midi(n)), 0.8, 0.7), 0.5)
    t.add(0.45, bell(hz(midi("A5")), 1.0), 0.3)
    return normalize(room(t.x, 0.3), 0.85)


def pick():
    t = Track(0.5)
    t.add(0, bell(hz(midi("E5")), 0.4), 0.6)
    t.add(0.09, bell(hz(midi("A5")), 0.4), 0.5)
    return normalize(t.x, 0.7)


def vote_open():
    """The vote begins: a heartbeat and a rising tension note."""
    t = Track(1.2)
    t.add(0.0, kick(0.3, 100, 45), 0.8)
    t.add(0.22, kick(0.3, 95, 45), 0.55)
    t.add(0.1, tone(hz(midi("E3")), 1.0, "saw", 0.3, 0.4, 0.5, 0.4, slide=hz(midi("A3"))), 0.18)
    t.add(0.7, bell(hz(midi("E6")), 0.5), 0.25)
    return normalize(lowpass(t.x, 0.5), 0.8)


def approved():
    """A team is approved: a bright two-note chime, major and open."""
    t = Track(1.1)
    t.add(0.0, bell(hz(midi("G5")), 0.9), 0.55)
    t.add(0.12, bell(hz(midi("D6")), 0.9), 0.5)
    t.add(0.12, bell(hz(midi("B5")), 0.9), 0.3)
    return normalize(room(t.x, 0.25), 0.8)


def rejected():
    """A team is rejected: a low, dull buzz that sags."""
    t = Track(0.9)
    t.add(0.0, tone(hz(midi("D2")), 0.6, "saw", 0.005, 0.5, 0.2, 0.2, slide=hz(midi("A1"))), 0.5)
    t.add(0.0, tone(hz(midi("D#2")), 0.6, "square", 0.005, 0.5, 0.2, 0.2, slide=hz(midi("A#1"))), 0.3)
    t.add(0.0, kick(0.5, 80, 38), 0.6)
    return normalize(lowpass(t.x, 0.18), 0.85)


def mission_start():
    """The mission begins: a heavy lock closing and a low boom."""
    t = Track(1.2)
    t.add(0.0, noise(0.03, 3, 0.0005, 0.03, highpass=0.7), 0.8)
    t.add(0.0, tone(hz(midi("G5")), 0.12, "square", 0.001, 0.1, 0.0, 0.01), 0.18)
    t.add(0.13, noise(0.05, 4, 0.0005, 0.05, highpass=0.6), 0.9)
    t.add(0.13, tone(hz(midi("C5")), 0.2, "square", 0.001, 0.18, 0.0, 0.01), 0.2)
    t.add(0.22, kick(0.9, 70, 32), 1.0)
    t.add(0.22, tone(hz(midi("A1")), 0.9, "sine", 0.01, 0.8, 0.0, 0.1), 0.4)
    return normalize(room(t.x, 0.3), 0.9)


def success():
    """The mission succeeds: a rising major arpeggio of bells."""
    t = Track(1.6)
    for i, n in enumerate(("C5", "E5", "G5", "C6")):
        t.add(i * 0.1, bell(hz(midi(n)), 1.0), 0.45)
    t.add(0.4, bell(hz(midi("E6")), 1.1), 0.3)
    t.add(0.4, tone(hz(midi("C3")), 1.0, "tri", 0.02, 0.9, 0.0, 0.1), 0.3)
    return normalize(room(t.x, 0.35), 0.85)


def failure():
    """The mission fails: an alarm, a falling growl and a boom."""
    t = Track(1.6)
    for i in range(3):
        t.add(i * 0.17, tone(hz(midi("E5")), 0.13, "square", 0.002, 0.1, 0.0, 0.01), 0.22)
        t.add(i * 0.17 + 0.0, tone(hz(midi("B4")), 0.13, "square", 0.002, 0.1, 0.0, 0.01), 0.15)
    t.add(0.55, tone(hz(midi("A2")), 0.9, "saw", 0.005, 0.8, 0.0, 0.1, slide=hz(midi("A1"))), 0.5)
    t.add(0.55, tone(hz(midi("Bb2")), 0.9, "saw", 0.005, 0.8, 0.0, 0.1, slide=hz(midi("Bb1"))), 0.35)
    t.add(0.55, kick(0.9, 90, 34), 0.9)
    t.add(0.55, noise(0.5, 8, 0.002, 0.45, lowpass=0.2), 0.5)
    return normalize(room(lowpass(t.x, 0.6), 0.3), 0.9)


def resistance_wins():
    """The Resistance win: a short, brassy major fanfare."""
    t = Track(3.2)
    brass = [(0.0, "C4", 0.18), (0.18, "E4", 0.18), (0.36, "G4", 0.18), (0.54, "C5", 0.5),
             (1.1, "G4", 0.18), (1.28, "C5", 0.18), (1.46, "E5", 1.3)]
    for s, name, ln in brass:
        f = hz(midi(name))
        t.add(s, tone(f, ln + 0.1, "saw", 0.03, 0.15, 0.7, 0.12, vibrato=5.5, harmonics=[(2, 0.2)]), 0.3)
        t.add(s, tone(f * 0.5, ln + 0.1, "tri", 0.03, 0.15, 0.7, 0.12), 0.25)
    for i, n in enumerate(("C5", "E5", "G5", "C6", "E6")):
        t.add(1.46 + i * 0.05, bell(hz(midi(n)), 1.6), 0.25)
    t.add(1.46, kick(0.6, 100, 45), 0.8)
    return normalize(room(lowpass(t.x, 0.55), 0.4), 0.88)


def spies_win():
    """The Spies win: a slow, minor, sinister figure with a low hit and a last cold bell."""
    t = Track(3.4)
    figure = [(0.0, "A3", 0.4), (0.45, "C4", 0.4), (0.9, "E4", 0.4), (1.35, "G#4", 0.9)]
    for s, name, ln in figure:
        t.add(s, pluck(hz(midi(name)), ln + 0.5, 0.6), 0.55)
        t.add(s, tone(hz(midi(name)) * 2, ln, "sine", 0.01, ln, 0.0, 0.1), 0.1)
    t.add(1.35, kick(1.0, 85, 34), 0.9)
    t.add(1.35, tone(hz(midi("A1")), 1.8, "saw", 0.05, 1.5, 0.2, 0.6, vibrato=4), 0.25)
    t.add(2.1, bell(hz(midi("A5")), 1.2), 0.35)
    t.add(2.1, bell(hz(midi("E6")), 1.2), 0.2)
    return normalize(room(lowpass(t.x, 0.5), 0.45), 0.88)


def player_joins():
    t = Track(0.4)
    t.add(0.0, bell(hz(midi("A5")), 0.3), 0.5)
    t.add(0.07, bell(hz(midi("E6")), 0.3), 0.4)
    return normalize(t.x, 0.6)


SOUNDS = {
    "lobby": lobby, "roundstart": deal, "pick": pick, "open": vote_open, "correct": approved, "wrong": rejected,
    "lock": mission_start, "ding": success, "strike": failure, "fanfare": resistance_wins, "winner": spies_win,
    "join": player_joins,
}


# ---------------------------------------------------------------- Family Feud

def feud_theme():
    """Family Feud's lobby theme: a bright, bouncy, original game-show tune. 124 beats a minute, C major, sixteen bars:
    a bouncing bass, handclaps on two and four, off-beat brassy stabs, a hook of rising notes and sparkling bells, with
    a higher, busier second half. Wrapped so the end runs straight back into the start."""
    bpm = 124
    beat = 60 / bpm
    bars = 16
    length = bars * 4 * beat
    tail = 2.0
    t = Track(length + tail)
    prog = [(36, "C"), (43, "G"), (45, "A"), (41, "F")]   # C2 G2 A2 F2 with the chord's name for its triad
    triads = {"C": (60, 64, 67), "G": (59, 62, 67), "A": (60, 64, 69), "F": (60, 65, 69)}
    for bar in range(bars):
        root, name = prog[bar % 4]
        # Drums: kick on one and three (with a pickup), claps on two and four, eighth-note hats.
        t.add((bar * 4) * beat, kick(0.3, 120, 48), 0.55)
        t.add((bar * 4 + 2) * beat, kick(0.3, 115, 48), 0.5)
        if bar % 2 == 1:
            t.add((bar * 4 + 3.5) * beat, kick(0.2, 110, 48), 0.35)
        for b in (1, 3):
            t.add((bar * 4 + b) * beat, noise(0.12, 100 + bar * 2 + b, 0.001, 0.1, highpass=0.7), 0.42)
        for k in range(8):
            t.add((bar * 4 + k * 0.5) * beat, hat(bar * 8 + k, 0.04), 0.22 if k % 2 else 0.12)
        # Bass: root, octave, fifth: bouncing.
        for b, n in ((0, root), (0.75, root + 12), (1.5, root + 7), (2, root), (2.75, root + 12), (3.5, root + 7)):
            t.add((bar * 4 + b) * beat, pluck(hz(n), 0.3, 0.55), 0.5)
        # Brassy stabs on the off-beats.
        for b in (1.5, 3.5):
            for n in triads[name]:
                t.add((bar * 4 + b) * beat, tone(hz(n), 0.18, "saw", 0.005, 0.12, 0.2, 0.04, harmonics=[(2, 0.25)]), 0.075)
    # The hook: four rising notes, answered by a falling three. It returns every two bars and climbs in the second half.
    hook = [(0, "G4", 0.5), (0.5, "C5", 0.5), (1, "E5", 0.5), (1.5, "G5", 1.0), (3, "E5", 0.5), (3.5, "D5", 0.5), (4, "C5", 1.5)]
    for bar in range(bars):
        if bar % 2 == 0:
            lift = 12 if bar >= 8 else 0
            for b, name, ln in hook:
                n = midi(name) + lift
                t.add((bar * 4 + b) * beat, tone(hz(n), ln * beat + 0.15, "tri", 0.01, 0.2, 0.5, 0.08, harmonics=[(2, 0.2), (3, 0.08)]), 0.16)
    # Sparkle: a run of bells up the scale at the end of every fourth bar.
    for bar in (3, 7, 11, 15):
        for i, n in enumerate(("C6", "D6", "E6", "G6", "A6", "C7")):
            t.add((bar * 4 + 2.5 + i * 0.25) * beat, bell(hz(midi(n)), 0.5), 0.09)
    x = room(t.x, 0.18)
    body = x[: int(length * SR)]
    for i, s_ in enumerate(x[int(length * SR):]):
        if i < len(body):
            body[i] += s_
    return normalize(body, 0.9)


def feud_correct():
    """A right answer on the survey board: a bright bell ding with a shimmer and a little rising sparkle."""
    t = Track(1.6)
    t.add(0.0, bell(hz(midi("E6")), 1.3), 0.6)
    t.add(0.0, bell(hz(midi("B6")), 1.2), 0.28)
    t.add(0.0, tone(hz(midi("E4")), 0.12, "tri", 0.002, 0.1, 0.0, 0.02), 0.25)
    for i, n in enumerate(("G6", "B6", "E7")):
        t.add(0.16 + i * 0.07, bell(hz(midi(n)), 0.7), 0.16)
    return normalize(room(t.x, 0.3), 0.85)


def feud_buzzer():
    """A face-off buzzer: a short, punchy "BZZT" and a bright ping to say who was first."""
    t = Track(0.9)
    t.add(0.0, tone(hz(midi("A3")), 0.22, "square", 0.002, 0.2, 0.7, 0.03, slide=hz(midi("G3"))), 0.34)
    t.add(0.0, tone(hz(midi("A3")) * 1.01, 0.22, "saw", 0.002, 0.2, 0.7, 0.03, slide=hz(midi("G3")) * 1.01), 0.26)
    t.add(0.0, noise(0.05, 77, 0.0005, 0.05, highpass=0.5), 0.3)
    t.add(0.2, bell(hz(midi("A6")), 0.6), 0.4)
    t.add(0.2, bell(hz(midi("E7")), 0.5), 0.18)
    return normalize(room(lowpass(t.x, 0.7), 0.2), 0.88)


def write_wav(path, samples):
    with open(path, "wb") as f:
        data = b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples)
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


LIBRARY = {
    "spynight": SOUNDS,
    "feud": {"lobby": feud_theme, "ding": feud_correct, "faceoff": feud_buzzer},
}


def main():
    # python3 make_spynight_sounds.py [spynight|feud] [names...]   (no arguments: everything)
    args = sys.argv[1:]
    games = [args.pop(0)] if args and args[0] in LIBRARY else list(LIBRARY)
    os.makedirs(M4A_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for game in games:
            mp3_dir = os.path.join(ROOT, "public", "builtin-sounds", game)
            os.makedirs(mp3_dir, exist_ok=True)
            for name in args or list(LIBRARY[game]):
                wav = os.path.join(tmp, f"{game}-{name}.wav")
                made = LIBRARY[game][name]()
                write_wav(wav, made if name in ("lobby", "think") else fade_edges(made))
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", os.path.join(mp3_dir, f"{name}.mp3")], check=True)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "aac", "-b:a", "96k", os.path.join(M4A_DIR, f"{game}__{name}.m4a")], check=True)
                print("wrote", game, name)


if __name__ == "__main__":
    main()
