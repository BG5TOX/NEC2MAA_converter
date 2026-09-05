# The MMANA-GAL .maa File Format — A Concise Reference

> A standalone, practical description of the `.maa` text format as written
> by MMANA-GAL. Based on full censuses of the 722-file official example
> library (`MMANA-GALBasic3\ANT`) and the 935-file AntennaFiles-OLD
> collection, plus the MMANA-GAL manual (gal-ana.de/basicmm/en/).
> Companion to `MAA file format (corrected).md`, which details the errors
> found in OpenNEC's version of this document.
>
> **R21 update (2026-09-03)**: the `$$$ Taper wire set $$$` section is now
> **parsed** and negative-radius wires are **rebuilt** into connected GW
> sections with stepped radii — see §5a for the full semantics.

## 1. File layout at a glance

A `.maa` file is a plain-text sequence of sections. Two variants exist:

```
VARIANT A (compact counts line)          VARIANT B (per-section headers)
─────────────────────────────           ─────────────────────────────────
<title>                                  [<title>]            ← optional
<frequency MHz>                          *
                                         <frequency MHz>
<nw> <nl> <ns>        ← one line         ***Wires***
<nw wire rows>                           <nw>
                                         <nw wire rows>
[***Source***]                           [***Source***]
[<ns>, 0]                                [<ns>, 0]
[<ns source rows>]                       [<ns source rows>]
[***Load***]                              [***Load***]
[<nl>, 0]                                [<nl>, 0]
[<nl load rows>]                         [<nl load rows>]
[***Segmentation*** / G/H / ###Comment### extra sections]
```

Key points:

* Wire rows come **immediately after the counts** — never after a blank line or comment.
* Section headers appear both as `*** Name ***` and as the compact single-star
  form `* Name *` (Russian releases: `* Провода *`, `*** Источ. ***`,
  `*G/H/M/R/AzEl/X*`). Treat both spellings the same.
* The source/load count lines (`<n>, 0`) follow their section header; the
  second value is always `0`.
* In Variant A the three counts `nw nl ns` share one line **before** any
  wire data; the wire rows still follow directly.
* Separators are permissive: commas or any whitespace mix; case-insensitive.

## 2. Wire row (8 fields)

```
x1, y1, z1, x2, y2, z2, radius, seg
```

* Coordinates and radius in **metres** (MMANA converts mm/λ input before saving).
* `seg` — segment count, with MMANA auto-segmentation markers:

| Value | Meaning |
|---|---|
| `> 0` | Exact segment count |
| `0` | Auto, uniform |
| `-1` | Auto, tapered at both ends (the common case — **98.9 %** of library rows) |
| `-2` / `-3` | Auto, tapered at start / finish end only |

## 3. Source row

```
<designator>, <phase°>, <magnitude>
```

The designator is a compact token: `[W|V]<wire><C|B|E>[±offset]`

* `W`/`V` — source type (both mean a feed; importers map either to a voltage source).
* `<wire>` — ordinal position in the Wires list (1-based).
* `C`/`B`/`E` — attachment at centre / first / last segment.
* Optional signed offset in segments, e.g. `W3C1` = one past centre of wire 3,
  `W4C-1` = one before centre, `W6E-2` = two before the end.
  With N computed segments: `C` → `(N+1)/2`, `B` → 1, `E` → N; clamp to `[1, N]`.

## 4. Load row

Two real-world forms (a third, six-field legacy form exists only in old files):

```
<designator>, 0, <L µH>, <C pF>, <Q>      series L-C load
<designator>, 1, <R Ω>, <X Ω>             fixed series impedance
```

⚠ **Units**: L is in **microhenries** and C in **picofarads** — not H/F.
Library census: 542 L-C rows, 163 R-jX rows, 8 unmapped 12-field S-parameter
rows. Designator syntax is identical to the source designator.

## 5. Extra sections

### `***Segmentation***` — one line, 4 values

```
<max-segs>, <segs-per-λ>, <taper-ratio>, <min-segs>
```

Example `800, 80, 2.0, 2`. Controls MMANA's *Auto-segment* feature:
total limit (200–1500), segments per wavelength (40–200), adjacent-segment
length ratio (1.01–2.0), minimum per wire (2–16). A positive wire `seg` value
overrides auto-segmentation for that wire.

### `***G/H/M/R/AzEl/X***` — one line, 7 fields

The section name spells the field meanings:

| # | Letter | Field |
|---|---|---|
| 1 | G | Ground type: `0` free-space, `1` perfect, `2` real (MININEC), `-1` Sommerfeld-Norton |
| 2 | H | **Add height** — vertical offset of the whole model (m) |
| 3 | M | **Material index** of the wire (see table below) |
| 4 | R | Reference impedance — resistance part (Ω, usually 50) |
| 5 | Az | Rear-lobe azimuth range for the F/B statistic |
| 6 | El | Rear-lobe elevation range for the F/B statistic |
| 7 | X | Reference impedance — reactance part (Ω) |

Material index:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| No loss | Cu wire | Cu pipe | Al wire | Al pipe | Fe wire | Fe pipe |

⚠ The ground section carries **no soil parameters**. Ground conductivity
and dielectric constant are *not stored anywhere in a .maa file*; tools that
need them (e.g. for a NEC `GN` card) must take them from user input or an
external soil-preset table. The material index selects a built-in MMANA
preset whose σ/µ values are likewise not written to the file.

### `###Comment###`

Free-form text, on the same line or the following line(s). Often CP1251
Russian in old files — byte-preserving pass-through is safest.

### `$$$ … $$$` blocks

The `$$$ Taper wire set $$$` block defines tapered wires — see §5a below.
Other `$$$` extension blocks exist and are skipped by third-party tools.

### 5a. `$$$ Taper wire set $$$` — tapered-wire definitions

Label: `$$$ Taper wire set $$$` (English) or the Cyrillic CP1251 equivalent
(reads as mojibake under UTF-8/latin1) — **match on the `$$$` prefix only**.
The label may appear anywhere; typically after the G/H line.

```
$$$ <label> $$$
<definition-count>                        ← like the wire count
name(<0), Type, L1, R1, L2, R2, …, L10, R10
```

A wire references a definition by putting its **negative radius value** in
the wire row's radius column — that row is then a tapered element, not a
wire of that radius.

* **Units: metres** on disk. The MMANA editor labels R as mm, but stored
  values are metres (4EL20HM title "30mm/25mm/20mm Pipe" ↔ R =
  0.015/0.0125/0.01 m).
* **Type on disk = UI number − 1** (`0–3`):
  `0/2` = center-out (symmetric — expands from the wire midpoint toward
  both ends), `1/3` = sequential (wire start → end). Even/odd (uniform vs
  non-uniform *original* segmentation) carries no geometric meaning.
* **Symmetric lengths (final, user-verified)**:
  * `L1` = **total length of the center node** → one section
    `[c−L1/2, c+L1/2]` spanning the midpoint (so the feedpoint anchor
    `w?c` lands inside a single section at its 50%).
  * `L2..L10` = **per-side lengths** of the finer outer nodes, laid out
    from the center node's edges toward the ends.
  * Verifying formula (jp2000 element 10):
    total = tail + L2 + L1 + L2 + tail = 1.03 + 0.52 + 2.0 + 0.52 + 1.03
    = 5.10 m ✓
  * If `L1/2` exceeds the half-length the center node is clipped to the
    whole wire; if the *outer* accumulated length exceeds the half-length,
    the outer nodes are truncated at the wire end (no tail). Example
    (8EL6MW, 6 m yagi): element half-lengths 1.29–1.50 m, L1 = 2.0 →
    center node 2 m @ 7 mm + 0.46 m @ 5 mm tips per side.
* **Tip sentinel**: a pair with `L ≥ 99999` extends from the accumulated
  position to the wire end. When the accumulated node lengths exceed the
  half-length, outer nodes are truncated at the wire end (no tail).
* An importer **must rebuild** each referenced wire into connected
  sections with stepped radii — treating the negative radius literally
  produces wrong geometry.

## 6. Practical parser checklist

1. Detect variant: a `***Wires***`-style header before any data → B; a
   combined counts line right after the frequency → A.
2. Read counts **before** wire rows; stop wire parsing at the first
   non-numeric line.
3. Classify source/load rows **by data shape** (field count + type column),
   not by section-header text — Cyrillic headers become mojibake when the
   CP1251 file is read as UTF-8/latin1.
4. Expect the G/H line's 7 fields exactly; material index may legitimately
   be 0–6.
5. Auto-segmentation: `seg ≤ 0` rows need the Segmentation parameters **and
   the frequency** to resolve to concrete counts; only then can source/load
   segment positions be computed.
6. Negative wire **radius** = tapered-wire reference. Capture the
   `$$$ … $$$` definition table (match on `$$$` prefix; Cyrillic labels are
   mojibake) and rebuild those wires into stepped-radius connected
   sections (§5a) — never emit the negative radius literally.
7. Tolerate missing sections entirely (title, loads, G/H, comments, and the
   taper block are all optional).

## 7. Minimal complete example

```
144CQlomba                              ← title
*                                       ← separator
144.28                                 ← frequency MHz
***Wires***
16                                     ← wire count
0.37853, -0.26672, 0, 0.37853, 0.52672, 0, 8.000e-04, -1
...                                    ← 15 more wire rows
***Source***
1, 0
w1c, 0.0, 1.0                          ← centre of wire 1, 1 V, 0°
***Load***
0, 0
***Segmentation***
800, 80, 2.0, 2
***G/H/M/R/AzEl/X***
2, 10.0, 1, 50.0, 120, 60, 0.0         ← real ground, h=10 m, Cu wire
###Comment###
DL2KQ 144CQ-Lambda
```
