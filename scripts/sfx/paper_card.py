"""Procedural paper-card sounds, synced to the real hinge motion.

The cover's angle is simulated with the same spring the 3D card uses
(src/lib/cardMotion.ts: HINGE_SPRING, HINGE_RESTITUTION), so every sound
event lands on the frame the card does it:

  * fibre friction  - band-passed noise + sparse fibre crackle, loudness and
                      brightness follow the hinge's angular speed
  * crease flex     - a few soft ticks while the fold starts to bend
  * air             - low noise for the cover sweeping air (speed squared)
  * contact         - cardstock "pap" when the cover slaps shut (opening
                      stops short of flat, so it only overshoots and settles)

Usage:  python3 scripts/sfx/paper_card.py <out_dir>
Writes  <variant>-open.wav / <variant>-close.wav (48 kHz mono) per variant.
"""

from __future__ import annotations

import sys
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SR = 48_000
STIFFNESS, DAMPING, RESTITUTION = 55.0, 10.0, 0.2  # keep in sync with cardMotion.ts
OPEN_MAX = np.pi * 0.94  # keep in sync with cardBend.ts: the cover never reaches the flat-open wall
TAIL_S = 0.35


@dataclass(frozen=True)
class Variant:
    name: str
    friction_gain: float  # fibre rub level
    crackle_rate: float  # fibre crackles per second at full speed
    brightness: tuple[float, float]  # rub band centre (Hz) at rest / full speed
    air_gain: float
    contact_gain: float
    body_hz: float  # cardstock thump resonance
    seed: int


VARIANTS = (
    # Heavy matte cardstock: warm, soft rub, a felt-like thump.
    Variant("a-matte", 0.55, 90, (900, 2200), 0.4, 0.9, 170, 11),
    # Textured watercolour paper: more fibre grain and crackle.
    Variant("b-textured", 0.7, 220, (1200, 3000), 0.3, 0.8, 210, 23),
    # Crisp coated card: brighter, quicker, clearer "pap".
    Variant("c-crisp", 0.5, 140, (1600, 4000), 0.25, 1.0, 260, 37),
)


def simulate_hinge(start: float, target: float) -> tuple[np.ndarray, list[tuple[float, float]]]:
    """Angular speed per sample and wall impacts (time s, impact speed rad/s)."""
    dt = 1.0 / SR
    x, v = start, 0.0
    speeds, impacts = [], []
    n = int(SR * 1.2)
    for i in range(n):
        v += (STIFFNESS * (target - x) - DAMPING * v) * dt
        x += v * dt
        if x < 0.0 or x > np.pi:
            impacts.append((i * dt, abs(v)))
            x = min(max(x, 0.0), np.pi)
            v = -np.sign(v) * RESTITUTION * abs(v)
        speeds.append(abs(v))
    return np.asarray(speeds), impacts


def band(signal: np.ndarray, lo: float, hi: float, slope: float = 0.25) -> np.ndarray:
    """Soft band-pass via FFT with raised-cosine skirts (no scipy needed)."""
    spec = np.fft.rfft(signal)
    f = np.fft.rfftfreq(signal.size, 1 / SR)
    lo_edge, hi_edge = lo * (1 - slope), hi * (1 + slope)
    gain = np.ones_like(f)
    rising = (f >= lo_edge) & (f < lo)
    falling = (f > hi) & (f <= hi_edge)
    gain[f < lo_edge] = 0
    gain[f > hi_edge] = 0
    gain[rising] = 0.5 - 0.5 * np.cos(np.pi * (f[rising] - lo_edge) / (lo - lo_edge))
    gain[falling] = 0.5 + 0.5 * np.cos(np.pi * (f[falling] - hi) / (hi_edge - hi))
    return np.fft.irfft(spec * gain, signal.size)


def smooth(env: np.ndarray, ms: float) -> np.ndarray:
    k = max(1, int(SR * ms / 1000))
    return np.convolve(env, np.ones(k) / k, mode="same")


def friction(speed: np.ndarray, v: Variant, rng: np.random.Generator) -> np.ndarray:
    norm = speed / max(speed.max(), 1e-9)
    env = smooth(norm**0.8, 12)
    # Rough, non-stationary grain: paper never rubs evenly.
    grain = smooth(np.abs(rng.standard_normal(speed.size)), 6)
    grain = 0.6 + 0.8 * grain / grain.max()
    lo_c, hi_c = v.brightness
    dark = band(rng.standard_normal(speed.size), lo_c * 0.5, lo_c * 1.6)
    bright = band(rng.standard_normal(speed.size), hi_c * 0.6, hi_c * 1.8)
    mix = (1 - env) * dark + env * bright  # brighter as it moves faster
    rub = mix * env * grain

    # Fibre crackle: sparse clicks, denser at speed.
    p = v.crackle_rate * norm / SR
    clicks = (rng.random(speed.size) < p) * rng.uniform(0.3, 1.0, speed.size)
    decay = np.exp(-np.arange(int(SR * 0.004)) / (SR * 0.0008))
    crackle = band(np.convolve(clicks, decay)[: speed.size] * rng.choice([-1, 1], speed.size), 2000, 6500)
    return v.friction_gain * (rub / (np.abs(rub).max() + 1e-9) + 0.5 * crackle / (np.abs(crackle).max() + 1e-9))


def crease_ticks(n: int, rng: np.random.Generator, at: float = 0.02, span: float = 0.12) -> np.ndarray:
    """The fold starting to bend: a few soft ticks just after the hinge starts."""
    out = np.zeros(n)
    for t in np.sort(rng.uniform(at, at + span, 4)):
        i = int(t * SR)
        tick = rng.standard_normal(int(SR * 0.006)) * np.exp(-np.arange(int(SR * 0.006)) / (SR * 0.0012))
        out[i : i + tick.size] += tick[: max(0, n - i)] * rng.uniform(0.15, 0.35)
    return band(out, 1500, 6000)


def air(speed: np.ndarray, v: Variant, rng: np.random.Generator) -> np.ndarray:
    env = smooth((speed / max(speed.max(), 1e-9)) ** 2, 30)
    return v.air_gain * band(rng.standard_normal(speed.size), 120, 700) * env


def contact(
    n: int, impacts: list[tuple[float, float]], v: Variant, rng: np.random.Generator, peak_speed: float, curve: float
) -> np.ndarray:
    out = np.zeros(n)
    t = np.arange(int(SR * 0.12)) / SR
    for when, impact in impacts:
        strength = min(1.0, impact / max(peak_speed, 1e-9)) ** curve
        if strength < 0.04:
            continue
        thump = np.sin(2 * np.pi * v.body_hz * t) * np.exp(-t / 0.018)
        pap = band(rng.standard_normal(t.size), 900, 3500) * np.exp(-t / 0.006)
        hit = (0.7 * thump + 0.9 * pap) * strength
        i = int(when * SR)
        out[i : i + hit.size] += hit[: max(0, n - i)]
    return v.contact_gain * out


def room(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A small desk-and-room tail so it doesn't sound like it's in a vacuum."""
    ir_t = np.arange(int(SR * 0.09)) / SR
    ir = band(rng.standard_normal(ir_t.size), 300, 8000) * np.exp(-ir_t / 0.022)
    ir[0] = 0
    wet = np.convolve(x, ir)[: x.size]
    return x + 0.08 * wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max()


def fade_out(x: np.ndarray, ms: float = 25) -> np.ndarray:
    k = int(SR * ms / 1000)
    y = x.copy()
    y[-k:] *= np.linspace(1, 0, k)
    return y


def render(v: Variant, opening: bool) -> np.ndarray:
    rng = np.random.default_rng(v.seed + (0 if opening else 1000))
    speed, impacts = simulate_hinge(0.0 if opening else OPEN_MAX, OPEN_MAX if opening else 0.0)
    # Stop once the cover has settled, plus a short tail.
    moving = np.nonzero(speed > 0.02 * speed.max())[0]
    n = min(speed.size, int(moving[-1] + SR * TAIL_S))
    speed = speed[:n]
    sig = friction(speed, v, rng) + air(speed, v, rng) + crease_ticks(n, rng)
    # Opening lands softly on the open fold; closing slaps the cover shut.
    if opening:
        sig += 0.6 * contact(n, impacts, v, rng, speed.max(), curve=0.7)
    else:
        sig += 1.8 * contact(n, impacts, v, rng, speed.max(), curve=0.35)
    sig = room(sig, rng)
    sig = fade_out(sig)
    return 0.89 * sig / np.abs(sig).max()  # -1 dBFS peak


def write_wav(path: Path, x: np.ndarray) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 1
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for v in VARIANTS:
        for opening in (True, False):
            x = render(v, opening)
            name = f"{v.name}-{'open' if opening else 'close'}.wav"
            write_wav(out / name, x)
            print(f"{name}  {x.size / SR:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
