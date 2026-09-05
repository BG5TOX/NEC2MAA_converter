MMANA-GAL ".maa" file format (corrected revision)
===============================================

> **Revision note (2026-09-02; taper section corrected 2026-09-03).** This is
> a corrected copy of the OpenNEC document `MAA file format.md`. The
> corrections are based on three rounds of empirical verification performed
> during the NEC2MAA converter project: a full census of the 722-file official
> MMANA-GAL example library (`C:\MMANA-GALBasic3\ANT`), a census of the
> 935-file AntennaFiles-OLD collection, and authoritative field naming
> supplied by an MMANA-GAL user. Errors in the original are marked
> **[CORRECTED]** with the corrected content in place; the original wording
> is summarised in the erratum notes.

Introduction
------------

The MMANA-GAL software (and its derivatives) use a text format for saving antenna models. The files normally use the `.maa` extension, or more rarely `.mma`. These files contain an ordered sequence of text lines, separated by header lines and line counts, somewhat similar to the [YO format](YO%20file%20format.md).

Although the format is undocumented, a large number of examples online allow the structure to be inferred. The variation seen in the wild ranges from the minimal 4-line variant used by simple exporters (frequency, counts, wires, loads, sources) through more elaborate files which include segmentation parameters, ground and measurement options, and comment blocks.

This document summarises the features that OpenNEC's import/export code understands and points out the sections that are currently ignored.

Format overview
---------------

A typical `.maa` file is organised into several sections, separated by section markers of the form `*** SECTION NAME ***`. Section headers appear in the wild both in the `*** NAME ***` triple-star form and in a compact single-star form `* NAME *` (used by the Russian-language MMANA releases, e.g. `* Провода *` for Wires, `*** Источ. ***` for Sources, `*G/H/M/R/AzEl/X*` for the ground line — both spellings carry the same meaning). Two structural variants exist (see *Format variants* below). The main sections are:

1. **Title line.**  Arbitrary text used as a description of the model, lacking a section header. The title is optional in Variant B — 220 of 935 files in the AntennaFiles-OLD collection omit it and begin with a bare `*` separator instead. When present, the converter creates a `CM` card containing this line followed by a `CE` card. During export to .maa, the first comment card in the deck is written back as the title line.

2. **Frequency line.**  A single floating-point value giving the design frequency in megahertz. Some files (Variant B) include a bare `*` on a separate line between the title and the frequency.

3. **Counts.**  In Variant A a single line holds three integers: wire count, load count, source count. In Variant B each count appears on its own line immediately inside the relevant `***…***` section.

4. **Wire (geometry) block.**  Following the section header line is the number of wires, followed by one line for each wire, each containing eight numeric values. The fields represent the end-point coordinates of a straight wire in metres, the radius, and the segment count. Example:
   ````
   0.0, -21.1, -3.662e-07,  0.0, 0.0, 0.0, 0.001, -1
   ````

   **Radius units.**  The radius field is always in metres. Although the MMANA-GAL GUI lets the user enter wire dimensions in millimetres or wavelengths, the software converts to metres before writing the file. OpenNEC imports and exports the value without conversion.

   **Segment count special values.**  A positive integer gives the exact NEC segment count for that wire.  The following negative and zero values are MMANA auto-segmentation directives:

   | Value | MMANA meaning |
   |---|---|
   | `0`  | Automatic uniform segmentation |
   | `-1` | Automatic tapering segmentation (denser near junctions) |
   | `-2` | Tapering applied only at the start end of the wire |
   | `-3` | Tapering applied only at the finish end of the wire |

   The importer computes a concrete segment count for each auto-seg wire using the `***Segmentation***` parameters and the design frequency. See the *Auto-segmentation* section below.

5. **Source (EX) block.**  A line giving the count, followed by that many source definitions.  Each definition uses a three-field format:

   ````
   <source-designator>, <phase°>, <magnitude>
   ````

   The source designator encodes the source type, wire number, attachment point and optional offset in a compact alphanumeric token.  The leading letter selects the source type:

   | Prefix | Source type |
   |---|---|
   | `W` | Wire |
   | `V` | Voltage source |

   After the type letter comes the wire number as a decimal integer, which is the ordinal position of the wire in the Wires list. After that is a single letter that identifies the attachment point on the wire:

   | Letter | Position |
   |---|---|
   | `C` | Centre segment |
   | `B` | Beginning (first) segment |
   | `E` | End (last) segment |

   An optional signed integer offset may follow the attachment letter immediately (no separator).  Positive values step towards the end; negative values step towards the beginning:

   | Designator | Meaning |
   |---|---|
   | `W1C`   | Centre segment of wire 1 |
   | `W3C1`  | One segment past the centre of wire 3 |
   | `W4C-1` | One segment before the centre of wire 4 |
   | `W5B`   | First segment of wire 5 |
   | `W6E3`  | Third segment from the end of wire 6 |

   The importer resolves the designator to a NEC segment index and emits an `EX 0` card with the magnitude and phase converted to real/imaginary components. All designators — including those pointing at wires with MMANA auto-segmentation markers — are resolved to concrete 1-based segment numbers using the computed wire segment counts:

   | Designator | Resolved segment |
   |---|---|
   | `W3C`   | `(N+1)/2` where N = computed segs of wire 3 |
   | `W3C1`  | `(N+1)/2 + 1` |
   | `W3C-1` | `(N+1)/2 − 1` |
   | `W6E`   | N (last segment) |
   | `W6E-2` | N − 2 |
   | `W5B`   | 1 (first segment) |

   Results are clamped to `[1, N]` to stay within wire bounds.

6. **Load (LD) block.**  A count line then load definitions. **[CORRECTED]** Real-world files carry the load row in the MMANA-GAL UI save form — a source-designator followed by a type column and the load values, not the bare six-field `wire, seg, R, X, L, C` tuple the original document described:

   ````
   <w-designator>, 0, <L µH>, <C pF>, <Q>     — series L-C load with Q factor
   <w-designator>, 1, <R Ω>, <X Ω>            — fixed series impedance
   ````

   Census of the official 722-file library: 542 rows of the L-C form, 163 rows of the R-jX form, plus 8 rows of a 12-field S-parameter form that no tool maps. The six-field Variant-A form (`wire, seg, R, X, L, C`) appears only in some old-collection files. The L and C values are in **microhenries and picofarads** in the UI save form — a units trap for any importer that assumes H and F.

7. **Optional extra sections.**  Many real-world `.maa` files then contain further labelled blocks such as:
   `***Segmentation***` (MMANA auto-segmentation tuning),
   `***G/H/M/R/AzEl/X***` (ground and measurement options),
   and final `###Comment###` lines with free-form text. The marker is
   sometimes followed by the comment on the same line, but more commonly the
   text appears on the next line; importers should handle both forms.
   During import each comment may be kept as a comment card, and when
   exporting comment cards are emitted back as `###Comment###` lines.

   The `***Segmentation***` section is imported as described below.

   The `***G/H/M/R/AzEl/X***` section contains a single comma-separated line with seven fields. **[CORRECTED]** The original document mis-identified fields 2, 3, 5–7. The section name itself spells the field meanings — **G**round, **H**eight, **M**aterial, **R** (resistance part of the reference impedance), **Az**imuth, **El**evation, **X** (reactance part of the reference impedance):

   | Field | Letter | Meaning |
   |---|---|---|
   | 1 | G | Ground type: `0`=free-space, `1`=perfect, `2`=real/MININEC, `-1`=Sommerfeld-Norton |
   | 2 | H | **Add height** — the extra vertical offset ("add height") applied to the whole model in the MMANA GUI (metres). *Not* conductivity; see erratum below. |
   | 3 | M | **Material index** of the antenna wire, one of the MMANA preset materials (see table below). *Not* a radials count. |
   | 4 | R | Resistance part of the reference impedance for SWR/reflection display (typically 50 Ω). |
   | 5 | Az | Rear-lobe azimuth range used for the F/B (front-to-back) statistic. |
   | 6 | El | Rear-lobe elevation range for the same F/B statistic. |
   | 7 | X | Reactance part of the reference impedance (Ω). |

   Material index values (MMANA-GAL presets; the underlying σ/µ parameters are built into the software and are not stored in the file):

   | Index | Material |
   |---|---|
   | 0 | No loss (lossless) |
   | 1 | Cu wire (copper wire) |
   | 2 | Cu pipe (copper pipe/tube) |
   | 3 | Al wire (aluminium wire) |
   | 4 | Al pipe (aluminium pipe/tube) |
   | 5 | Fe wire (iron wire) |
   | 6 | Fe pipe (iron pipe/tube) |

   Census of 1465 ground lines across both collections — field 3 distribution:
   0 = 625, 1 = 495, 2 = 17, 3 = 186, 4 = 141, 6 = 1 — consistent with
   users choosing lossless (0) or one of the common Cu/Al presets, and with
   the extension to 5/6 (iron) seen in the GUI. This distribution is
   consistent with a material selector; it is *not* consistent with a
   radials count (which would concentrate on 0 for non-GP antennas and on
   3/4/8 for GP antennas only).

   The importer emits a `GN` card (placed before the `FR` card so the deck is in the correct NEC order):
   - Type `0` → no `GN` card (free-space simulation)
   - Type `1` → `GN 1` (perfect ground)
   - Type `2` → `GN 0` (MININEC real ground)
   - Type `-1` → `GN 2` (Sommerfeld-Norton real ground)

   **[CORRECTED / REMOVED]** The original document stated that "the file stores only
   conductivity" and derived an epsr from field 2 via a soil-type correlation
   table (σ ≤ 0 → epsr 13, ≤ 1 → 5, 1–8 → 13, 8–30 → 17, > 30 → 25). This is
   an artifact of mis-reading field 2 (the add height) as conductivity: the
   `.maa` format **does not store ground conductivity or dielectric constant
   at all**. Any `GN` card with real-ground parameters must therefore take
   σ and εr from user input or an external preset table (e.g. the 4NEC2
   `Ground.txt` soil presets), never from the `.maa` file. The soil
   correlation table is deleted from this revision.

   **[CORRECTED / REMOVED]** The original `! maa-ground-radials:` comment and the
   statement that field 3 carries a radials count are deleted — field 3 is
   the material index. No `GD`-related information exists in the `.maa`
   ground section. A converter should instead flag `M > 0` (non-lossless
   material) and tell the user to set the wire material/loss manually in
   the target tool, because the preset material parameters are not stored
   in the file.

   The `***Segmentation***` section contains a single line with four comma-separated values that control how MMANA-GAL automatically divides wires into segments when the user clicks *Auto-segment*:

   | Field | Values seen | Meaning |
   |---|---|---|
   | 1 | 200 – 1500 | Maximum total segment count |
   | 2 | 40 – 200   | Target segments per wavelength |
   | 3 | 1.01 – 2.0 | Length taper ratio between adjacent segments |
   | 4 | 2 – 16     | Minimum segments per wire |

   Example: `800, 80, 2.0, 2` — 800 max total, 80 seg/λ, 2.0× taper, min 2/wire. Among the 935 files there are only 16 distinct combinations of these values. On import the values are used to compute concrete segment counts and are also preserved as a `! maa-segmentation:` annotation card so they can be written back correctly on export:

   `! maa-segmentation: dm1=800 dm2=80 sc=2 ec=2 mode=-1`

   The `mode=` field is appended when all wires share the same MMANA auto-segmentation type (common case). When wires differ, each `GW` card receives a per-wire `!segmentation:N` suffix instead.

Whitespace is permissive: commas or any combination of spaces and tabs may separate the numeric fields. The lines may also contain leading/trailing spaces. The format is case-insensitive. Files written by the Russian-language MMANA releases may contain Cyrillic section names (e.g. `Провода`, `Источ.`, `Нагрузка`, `Автосегм`) and Cyrillic comments; when read with a non-CP1251 encoding the section names become mojibake, so importers should classify rows by data shape rather than by decoding the section text.

Format variants
---------------

The 935 real-world `.maa` files of the AntennaFiles-OLD collection revealed two structural variants (see [MMA format survey.md](MMA%20format%20survey.md) for the full per-file table). **[CORRECTED note]** The official MMANA-GAL example library (`C:\MMANA-GALBasic3\ANT`, 722 files) shows the *opposite* split — 394 Variant-B vs 328 Variant-A — so a converter must handle both variants in comparable proportion; neither is dominant overall.

**Variant A — 729 of 935 files in the old collection (78 %)** — combined counts line, `***Wires***` optional

    Broadband antenna 80m 3.5 - 3.8MHz
    3.650000
    7 1 1              ← nw nl ns together
    0.0, -21.1, ..., 0.001, -1
    ...
    ***Source***
    1, 1
    w7c, 0.0, 1.0
    ***Load***
    0, 1
    ...

**Variant B — 205 of 935 files in the old collection (22 %)** — per-section headers, count inside each section

The title line is **optional** in Variant B — 220 of 935 files start immediately with a bare `*` separator and have no title. With title:

    144CQlomba
    *                  ← optional bare asterisk line
    144.28

Without title:

    *
    144.28
    ***Wires***
    16                 ← wire count alone
    0.37853, -0.26672, ..., 8.000e-04, -1
    ...
    ***Source***
    1, 0
    w1c, 0.0, 1.0
    ***Load***
    0, 0
    ...

Minimal grammar
---------------

(BNF for reference; both variants shown.)

```
<MMA-A>  ::= <title> NEWLINE
             <frequency> NEWLINE
             <nw> SEP <nl> SEP <ns> NEWLINE    // all three counts
             <wire>^nw
             ["***Source***" NEWLINE <ns> SEP <0> NEWLINE <src-a>^ns]
             ["***Load***"   NEWLINE <nl> SEP <0> NEWLINE <load>^nl]
             <extra>*

<MMA-B>  ::= [<title> NEWLINE]              // title is OPTIONAL in Variant B
             ["*" NEWLINE]                     // optional separator
             <frequency> NEWLINE
             "***Wires***" NEWLINE
             <nw> NEWLINE                      // wire count alone
             <wire>^nw
             ["***Source***" NEWLINE <ns> SEP <0> NEWLINE <src-b>^ns]
             ["***Load***"   NEWLINE <nl> SEP <0> NEWLINE <load>^nl]
             <extra>*

<wire>   ::= <float> SEP <float> SEP <float> SEP   // x1 y1 z1
             <float> SEP <float> SEP <float> SEP   // x2 y2 z2
             <float> SEP <seg-count>               // radius (metres), segments

<seg-count> ::= <positive-int>  // explicit NEC segment count
              | "0"             // auto uniform segmentation
              | "-1"            // auto tapering segmentation
              | "-2"            // taper at start end only
              | "-3"            // taper at finish end only

<src-a>  ::= <int> SEP <int> SEP <float> SEP <float>   // wire, seg, mag, phase°
<src-b>  ::= <src-designator> SEP <float> SEP <float>  // designator, phase°, mag

<src-designator> ::= <src-type> <int> <attach-point> [ <signed-int> ]
<src-type>       ::= "W" | "V"     // voltage source (both forms equivalent)
<attach-point>   ::= "C"           // centre segment
                   | "B"           // beginning (first) segment
                   | "E"           // end (last) segment
<signed-int>     ::= ["-"] <digit> { <digit> }  // offset from attach-point

<load>   ::= <src-designator> SEP "0" SEP <L-uH> SEP <C-pF> SEP <Q>   // L-C load
            | <src-designator> SEP "1" SEP <R-ohm> SEP <X-ohm>         // R-jX load
                                                        // [CORRECTED] see Load block above
                                                        // old Variant-A six-field rows
                                                        // (wire,seg,R,X,L,C) exist in some
                                                        // old-collection files

<extra>  ::= "***Segmentation***" NEWLINE <seg-params>   // MMANA auto-seg settings
           | "***G/H/M/R/AzEl/X***" NEWLINE <ground-params>
           | "###Comment###" [SP <text> | NEWLINE <text>]
           | other line  // ignored

<ground-params> ::= <G> SEP <H> SEP <M> SEP <R> SEP <Az> SEP <El> SEP <X> NEWLINE
                  // G: 0/1/2/-1 ground type
                  // H: add height (metres)
                  // M: material index 0-6 (0=no loss … 6=Fe pipe)
                  // R: reference impedance, resistance part (Ω)
                  // Az, El: rear-lobe F/B statistic range (degrees)
                  // X: reference impedance, reactance part (Ω)

<seg-params> ::= <max-segs> SEP <segs-per-wl> SEP <taper-ratio> SEP <min-segs> NEWLINE
                 // max-segs:    200–1500  total segment limit
                 // segs-per-wl: 40–200   segments per wavelength target
                 // taper-ratio: 1.01–2.0 adjacent-segment length ratio
                 // min-segs:    2–16     minimum segments per individual wire

SEP      ::= "," | whitespace+
```

The `***…***` headers and `###Comment###` markers may appear anywhere between sections and are interpreted or skipped as described above.

Auto-segmentation
-----------------

A key feature of the MMANA program is auto-segmentation, or as they refer to it, "tapering" - a poor choice of terms given "tapering" means something entirely different in NEC. The concept is documented in the Segmentation section of the MMANA-GAL documentation (currently) found here:

http://gal-ana.de/basicmm/en/

In NEC, geometry like a `GW` card includes a value for the number of segments it should be divided into. For instance, one might want a 10 metre long element to be represented internally as ten 1 meter parts. This "even segmentation" approach has several problems. For one, you generally want to use more segments where there are curves, as curvature can strongly influence the results. You can simply choose to use large numbers of segments, and some files do this, but this leads to longer calculation times.

MMANA-GA adds a system that calculates reasonable segment counts based on the size and shape of the element. It does this based on the wavelength of the test signal, which in NEC is found on the `FR` card. It also adjusts the segment sizes by their position, adding more segments at the ends of the elements and fewer in the center. This minimizes the number of small segments, and improves calculation time. There are settings to control whether to use manual segments (the NEC solution), use smaller segments at both ends, or at one end or the other. The manual strongly suggests using the both-ends method, -1, for most designs.

During import, OpenNEC uses the `***Segmentation***` parameters together with the design frequency to compute a concrete segment count for every wire that carries an auto-segmentation marker. The mode is also recorded in the deck. If all wires share the same auto-segmentation type (the common case — nearly all real-world files use `-1` uniformly), a single `! maa-segmentation:` annotation card is appended to the deck with the parameters and a `mode=` field, for example:

   `! maa-segmentation: dm1=800 dm2=80 sc=2 ec=2 mode=-1`

If the wires use different modes, the common-mode field is omitted from the global annotation and each `GW` card instead receives a per-wire `!segmentation:N` suffix.

This approach fixes the segment counts so that all other NEC cards (EX, LD, TL, etc.) that reference segment numbers are correct. The annotation also allows the exporter to reconstruct the original MMANA `.maa` file with the correct (negative) mode values in the SEG column and a `***Segmentation***` block containing the original parameters to complete the round-trip.

Census note (both collections, 1657 files): the SEG column is `-1` in 98.9 % of official-library wire rows; other observed values are `-2`, `-3`, `0`, small positive manual counts, and a handful of decimal-fraction values that belong to the `$$$ Taper wire set $$$` (tapered-wire) extension block rather than to the SEG column proper.

**[CORRECTED 2026-09-03] The `$$$ Taper wire set $$$` block (tapered wires).**
The original document dismissed this block as "should be skipped or handled
separately by importers". It is in fact the definition table for **tapered
wires** and is essential to correct geometry: a wire whose *radius* column
carries one of the block's negative values is not a wire of that radius but a
reference to a stepped-radius (tapered) element. 20 files in the official
722-file library use it, plus real-world designs (e.g. jp2000_147). The block
layout (verified empirically and by an MMANA user):

* The label is `$$$ Taper wire set $$$` in English releases and a Cyrillic
  equivalent (CP1251; reads as mojibake under UTF-8/latin1) in Russian
  releases — match on the `$$$` prefix only, never on the label text.
* First line after the label: **the number of taper definitions** (like the
  wire count inside `***Wires***`).
* Each definition line:
  `name(<0), Type, L1, R1, L2, R2, ..., L10, R10` — up to 10 L/R pairs.
* **Units are metres** on disk. (The MMANA editor labels R as mm, but stored
  values are metres — verified via the 4EL20HM title "30mm/25mm/20mm Pipe"
  matching R = 0.015/0.0125/0.01 m.)
* `Type` on disk is **0–3 = UI number − 1**: `0/2` = center-out (symmetric,
  the taper expands from the wire midpoint toward both ends), `1/3` =
  sequential (from the wire start to its end). Even/odd (uniform vs
  non-uniform *original segmentation*) is a segmentation-strategy detail
  with no geometric meaning for reconstruction.
* **Symmetric lengths (final, user-verified)**: `L1` is the **total length
  of the center node** (one section `[c−L1/2, c+L1/2]` spanning the
  midpoint); `L2..Ln` are **per-side lengths** of the finer outer nodes
  laid out from the center node's edges toward the ends. Verifying formula
  (jp2000 element 10): total = tail + L2 + L1 + L2 + tail = 1.03 + 0.52 +
  2.0 + 0.52 + 1.03 = 5.10 m ✓.
* A pair with `L ≥ 99999` is the **tip sentinel**: it extends from the
  accumulated position to the wire end (clipped by the wire's own length).
  If `L1/2` exceeds the half-length the center node is clipped to the whole
  wire; conversely, when the *outer* accumulated length exceeds the
  half-length the outer nodes are truncated at the wire end (no tail).
  Decisive example (8EL6MW, 6 m yagi): every element half-length is
  1.29–1.50 m with L1=2.0 → center node `[c−1.0, c+1.0]` 2 m @ 7 mm plus
  0.46 m @ 5 mm tips on each side — the correct tapered rendering.
* An importer must rebuild each referenced wire into multiple connected
  sections with stepped radii; otherwise the model geometry is wrong. The
  feedpoint anchor `w?c` should land inside the center node (at 50% of it),
  never on a junction of two same-radius sections.

Features not supported by OpenNEC
---------------------------------

* The `***G/H/M/R/AzEl/X***` ground section is imported and a `GN` card is emitted (see *Format overview* section 7). **[CORRECTED]** The ground section carries the ground *type* but no soil parameters — conductivity and dielectric constant are not stored in the `.maa` file, so any real-ground `GN` card parameters must come from user input or external presets. Field 3 is the wire material index (not a radials count); a `GD` card cannot be constructed from anything in this section. All other extra sections (measurement settings, stacking information, etc.) are still ignored.
* The full source designator syntax (`W`/`V` prefix, `C`/`B`/`E` attachment point, signed offset) is recognised by the importer. All designators are resolved to concrete 1-based segment numbers using the computed wire segment counts; the `V` source type is treated identically to `W` (both map to `EX 0`).
* The exporter produces Variant B: a `***Wires***` header with the wire count on its own line, followed by the wire data, then `***Source***` (before `***Load***`) with sources in `w<N>c, phase°, mag` form. It restores the original MMANA SEG mode values (the negative auto-segmentation markers) in the wire SEG column and emits a `***Segmentation***` block when the deck contains a `! maa-segmentation:` annotation. Ground and measurement headers (`***G/H/M/R/AzEl/X***`) are not emitted.
* Parallel loading networks, voltage sources with special types, and certain non-linear loads present in some `.maa` examples are not mapped. **[CORRECTED addition]** The 12-field S-parameter load rows observed in the official library (8 occurrences) are also not mapped.

Because of these omissions, running `read_deck_maa` followed by `write_deck_maa` on a real-world `.maa` file will produce a file that preserves the geometry (with original SEG mode markers), sources, loads, frequency, segmentation parameters, and comments, but omits the ground type entry. The round-trip is sufficient for re-opening the file in MMANA-GAL and re-running auto-segmentation.

Examples
--------

### Importer

The following shows `Broadband 80m.5.maa` converted to OpenNEC deck format by `read_deck_maa`. The title becomes the `CM` card, each wire becomes a `GW` card with a computed concrete segment count, the source designator `w7c` resolves to concrete segment 1 (wire 7 has 1 segment at this frequency), the `***Segmentation***` parameters are preserved as a `! maa-segmentation:` annotation, and the `###Comment###` block likewise becomes a `!` line. This file specifies free-space (`gtype=0`), so no `GN` card is emitted:

```
CM Broadband antenna 80m 3.5 - 3.8MHz (SWR<1,2)
CE
GW 1,28,0,-21.1,-0,0,0,0,0.001
GW 2,28,0.5,0,0,0.5,21.1,0,0.001
GW 3,24,0.5,-17.55,-0,0.5,0,0,0.001
GW 4,11,0,0,0,0.2,0,-1.03,0.001
GW 5,24,0,0,0,0,17.55,0,0.001
GW 6,11,0.3,0,-1.03,0.5,0,0,0.001
GW 7,1,0.2,0,-1.03,0.3,0,-1.03,0.001
! maa-segmentation: dm1=800 dm2=80 sc=2 ec=2 mode=-1
GE
EX 0,7,1,1.000000,0,0,0
FR 0,0,3.650000,0,0,0
RP 0,37,73,1000,0,0,5,5
EN
! Mod by UR0GT, 02.04.2008 0:06:04
```

All seven wires carry mode `-1` (taper both ends), so a single `mode=-1` is appended to the global annotation rather than annotating each `GW` card individually. Segment counts are computed from the `dm1=800 dm2=80 sc=2 ec=2` parameters at 3.65 MHz: the six longer wires receive 11–28 segments each; wire 7 is only 0.1 m (≈ 0.0012 λ) and receives 1 segment (below the minimum effective length for meaningful subdivision at this frequency). The source `w7c` (centre of wire 7) therefore resolves to segment 1.

### Exporter

The exporter produces Variant B output. Re-exporting the `Broadband 80m.5.maa` deck shown above back to `.maa` format gives:

```
Broadband antenna 80m 3.5 - 3.8MHz (SWR<1,2)
*
3.650000
***Wires***
7
0.000000, -21.100000, -0.000000, 0.000000, 0.000000, 0.000000, 0.001000, -1
0.500000, 0.000000, 0.000000, 0.500000, 21.100000, 0.000000, 0.001000, -1
0.500000, -17.550000, -0.000000, 0.500000, 0.000000, 0.000000, 0.001000, -1
0.000000, 0.000000, 0.000000, 0.200000, 0.000000, -1.030000, 0.001000, -1
0.000000, 0.000000, 0.000000, 0.000000, 17.550000, 0.000000, 0.001000, -1
0.300000, 0.000000, -1.030000, 0.500000, 0.000000, 0.000000, 0.001000, -1
0.200000, 0.000000, -1.030000, 0.300000, 0.000000, -1.030000, 0.001000, -1
***Source***
1, 0
w7c, 0.00, 1.000000
***Load***
0, 0
***Segmentation***
800, 80, 2, 2
###Comment###
Mod by UR0GT, 02.04.2008 0:06:04
```

The SEG column is restored to `-1` (the original MMANA mode marker) for all seven wires rather than the computed counts. The `***Segmentation***` block is written from the `! maa-segmentation:` annotation. The `sc=2` (taper ratio) value is written as `2` rather than `2.0` because trailing `.0` is suppressed by the `%.4g` format descriptor. The original Cyrillic characters in the comment are reproduced faithfully if the terminal encoding matches; they may appear garbled in ASCII-only environments.

The `*` separator between the title and frequency is always emitted. If no `CM` card is present the title line is left blank but the `*` is still written. If the deck has no `! maa-segmentation:` annotation (e.g. it was not imported from a `.maa` file), the `***Segmentation***` block is omitted and wire SEG columns contain the computed positive segment counts.

Erratum summary
----------------

For reference, the mis-statements in the original OpenNEC document and their corrections:

| # | Original statement | Correction |
|---|---|---|
| 1 | Field 2 of the G/H line is "Conductivity in mS/m; 0.0 = unspecified" | Field 2 is **H = add height** (vertical offset in metres). The `.maa` format stores no conductivity anywhere. |
| 2 | Field 3 is "Radials count (informational); GD card not emitted" | Field 3 is **M = material index** (0–6 per the MMANA preset list). No radials/GD information exists in the ground section. |
| 3 | Fields 5–7 are "Pattern display angles and height offset" | Field 5 = **Az**, field 6 = **El** (together the rear-lobe range for the F/B statistic); field 7 = **X**, the reactance part of the reference impedance. |
| 4 | epsr is derived from the conductivity via a soil-correlation table | Removed. Since no conductivity is stored, no derivation from `.maa` content is possible; real-ground `GN` parameters must come from user input or external presets. The table in the original was an artifact of mis-reading field 2. |
| 5 | `! maa-ground-radials:` comment records a radials count | Removed together with the radials interpretation. Converters should instead flag `M > 0` and prompt the user to set wire material manually (MMANA preset material parameters are not stored in the file). |
| 6 | Load rows are `<wire>, <seg>, R, X, L, C` | The dominant real-world forms are `<designator>, 0, L µH, C pF, Q` (L-C load; **µH/pF units**) and `<designator>, 1, R, X`. The six-field tuple appears only in some old-collection files. |
| 7 | Variant split quoted for the 935-file collection only | Noted that the official 722-file library splits the opposite way (B 394 / A 328); both variants must be handled. |
| 8 | The `$$$ Taper wire set $$$` block "stores stepped wire-diameter definitions and should be skipped or handled separately" | It stores **tapered-wire definitions** referenced by negative radius values in wire rows; skipping it produces wrong geometry. Full semantics (types 0–3, L1=center-node total length, L2–L10 per-side lengths, L≥99999 tip sentinel, metres on disk) are documented in the Auto-segmentation section above (corrected 2026-09-03). |

The corrected field meanings were confirmed against MMANA-GAL by an experienced user of the software, and the statistical distributions cited above are from full censuses of the 722-file official example library and the 935-file AntennaFiles-OLD collection performed during the NEC2MAA converter project (2026-09-01/02).
