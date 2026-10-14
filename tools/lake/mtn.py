"""Mountain lines for the lakeside (hand-chosen peaks, drawn soft).

A ridge is a soft maximum of a few bell-shaped peaks, so the saddles between
them stay round. Each peak is (centre x, height, spread left[, spread right
[, exponent]]): the exponent shapes the flanks. Below 2 a peak has a narrow
rounded summit over concave slopes that ease out into long feet (a calm
mountain); above 2 it is a rounder dome.
"""
import math

EXP = 1.7


def bell(x, pk):
    c, H, sl = pk[:3]
    s = sl if x <= c or len(pk) < 4 else pk[3]
    e = pk[4] if len(pk) > 4 else EXP
    return H * math.exp(-abs((x - c) / s) ** e / 2)


def ridge(x0, x1, step, peaks, base):
    """The mountain line from x0 to x1: y values, base minus the soft max of the peaks."""
    pts, x = [], x0
    while x <= x1 + .01:
        y = base - 5 * math.log(sum(math.exp(bell(x, pk) / 5) for pk in peaks))
        pts.append((round(x, 1), round(y, 1)))
        x += step
    return pts


def mountain(x0, x1, step, peaks, base, sag=1.2, foot=8):
    """A closed mountain: its ridge, feet on `base`, a hand-sagging base line back.
    The ridge stops where it is less than `foot` above the base, and each end
    comes down to the base in one short step (1.2 `foot` across), so the feet
    are blunt and round instead of long needles along the base line."""
    top = [p for p in ridge(x0, x1, step, peaks, base) if base - p[1] >= foot]
    x0, x1 = top[0][0] - 1.2 * foot, top[-1][0] + 1.2 * foot
    top = [(x0, base)] + top + [(x1, base)]
    n = max(3, int((x1 - x0) / 50))
    back = [(x1 - (x1 - x0) * i / n, base + 2 + sag * math.sin(math.pi * i / n) * (1 if i % 2 else .5)) for i in range(1, n)]
    return top + back
