# Flying Fluck physical print preparation

The original October 13 front and matching back have been recovered. Both are
1024 × 1536 pixel raster images. The experimental lettering and small wired
flamingo are preserved. The website's optimized WebP covers and existing ad are
presentation assets. **They are not a printer-approved cover production master.**

## What is verified

- The existing digital file has 192 pages at 6 × 9 inches, including two covers.
- Its separate physical interior has 190 pages, containing 168 guided writing
  pages across Energy, Boundaries, Clarity and Release. Weekly resets are part
  of those 168 pages.
- The new editable layout retains the original 504 writing prompts, corrects
  clipping, uses embedded DejaVu fonts, has mirrored inside/outside margins, and
  labels the sections as Flying Fluck rather than the separate Field Manual 01
  product. The original Library file is retained.
- Original cover resolution is about 171 dpi across 6 × 9 inches. No resampling
  is described as higher native detail. Original PNGs are included in the
  delivered proof kit, not substituted with unrelated flamingo artwork.

## Provisional layout defaults

All values are editable in `settings.json`; none is a confirmed printer order.

| Item | Draft value |
| --- | --- |
| Physical trim | 6 × 9 inches, inherited from the digital file |
| Cover bleed | 3.175 mm / 0.125 inch on each outer edge |
| Cover safe inset | 6.35 mm / 0.25 inch from trim |
| Single-panel cover with bleed | 158.75 × 234.95 mm / 6.25 × 9.25 inches |
| Interior inside / outside | 18 / 12.7 mm, mirrored by page parity |
| Interior top / bottom | 15.24 mm |
| Binding, paper and spine | Unconfirmed; spine stays `null` |

Each SVG has an editable bleed background, the complete original raster as an
embedded image, and a hidden `guides` layer. The layout is editable; the original
experimental lettering is raster, not an editable font. PDF cover proofs show
trim marks and safe guides; their MediaBox includes a review slug outside the
BleedBox. They are explicitly marked **LAYOUT PROOF / NOT FOR PRESS**.

The artwork is uniformly inset inside the draft safe region. A final printer
template may require a different inset, bleed, cover stock or binding clearance.
Do not upload a guide-marked proof as a final print file.

## Spine specification

Count the **190 interior pages / 95 leaves**, excluding front and back panels.
Ask the selected printer for the spine for that count, stock and binding.
There is no universal page-to-spine coefficient.

For a printer-confirmed **perfect-bound paperback only**:

`wrap width = 2 × trim width + printer-supplied spine + 2 × outer bleed`

With the draft dimensions, wrap width is `311.15 mm + spine_mm`, and height is
`234.95 mm`. Do not create a zero-width or example spine and call it final.
Hardcover hinges, boards and turn-ins, or spiral punch clearance, require the
actual printer template instead.

## Rebuild the delivered proof kit

Python 3, ReportLab, pypdf, Pillow and DejaVu Sans / Sans Bold / Sans Mono are
required. On Linux the default font directory is
`/usr/share/fonts/truetype/dejavu`; set `A305X_FONT_DIR` if necessary.

Place the exact approved PNGs at `front-original.png` and `back-original.png`
in a local artwork directory. Generate full product PDFs **outside the website
checkout** so they do not become public prelaunch downloads:

```bash
python3 production/flying-fluck/build.py \
  --artwork-dir /absolute/artwork \
  --output /absolute/proofs
```

Outputs: a 190-page vector interior proof; a 192-page digital proof; a 10-page
interior sample; two-panel PDF cover layout proof; two SVG layout templates; a three-page
print worksheet; a build report containing native asset hashes and dimensions.
The public preview has sampled source page numbers, not ten consecutive folios.
It contains ten interior pages and uses standard PDF fonts to keep the download
small. The original covers are shown in the website gallery and preserved in
the complete digital proof. The physical interior uses embedded DejaVu fonts.

`--final` validates release inputs and rejects unconfirmed printer values, a
missing or nonpositive spine, mismatched page counts and inadequate native image
resolution. This generic RGB proof builder intentionally does not claim to
perform a printer-specific ICC/PDF/X production export. Final production export
must use the selected printer's exact template and color workflow.

## Website and commerce

`/flying-fluck` is a separate product presentation from `/store#field-manual`.
Only the sample is publicly downloadable. Physical ordering and preorders remain
closed; no price or fulfillment arrangement has been invented. The existing ad
is a concept mockup, including its illustrated book construction.

Run `node --test tests/flying-fluck.test.mjs` and the Python verifier for page
counts, boxes, font embedding, text bounds, asset identity and the release guard.
Browser interaction QA was unavailable in the current managed environment.
