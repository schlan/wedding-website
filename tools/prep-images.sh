#!/bin/sh
# Makes web-ready copies of the venue and couple photos in site/img/
# Run once, and again if higher-resolution originals arrive:
#   sh tools/prep-images.sh
# Needs: sips (built into macOS) and cwebp (brew install webp).
# Never makes an image larger than its original.
set -eu

SRC="handoff/wedding-site-handoff/assets/photos"
OUT="site/img"
QUALITY=74
mkdir -p "$OUT"

# name:widths  (widths larger than the original are skipped)
for spec in \
  "hero-casa-bini-sunset:600 864 1400" \
  "venue-aerial-pool:600 864 1400" \
  "venue-dining-table:480 864" \
  "venue-bedroom:480 864" \
  "spare-living-room:480 864"
do
  name=${spec%%:*}
  widths=${spec#*:}
  src="$SRC/$name.jpg"
  orig=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')
  for w in $widths; do
    # Skip sizes well above the original; a size just above it uses the original width.
    [ "$w" -gt $((orig + 16)) ] && continue
    px=$w; [ "$px" -gt "$orig" ] && px=$orig
    jpg="$OUT/$name-$w.jpg"
    sips -s format jpeg -s formatOptions "$QUALITY" --resampleWidth "$px" "$src" --out "$jpg" >/dev/null
    cwebp -quiet -q "$QUALITY" -resize "$px" 0 "$src" -o "$OUT/$name-$w.webp"
    echo "$name-$w  jpg $(wc -c < "$jpg" | tr -d ' ')B  webp $(wc -c < "$OUT/$name-$w.webp" | tr -d ' ')B"
  done
done

# Couple photos, cropped for the hero (originals stay in handoff/, which is not in git).
# name:source:crop (x y width height, in original pixels):widths
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for spec in \
  "hero-couple-garden:couple-garden:150 360 900 1100:600 900" \
  "hero-couple-boat:couple-boat:420 90 700 700:320 480"
do
  name=${spec%%:*}; rest=${spec#*:}
  src="$SRC/${rest%%:*}.jpg"; rest=${rest#*:}
  crop=${rest%%:*}; widths=${rest#*:}
  # Lossless intermediate of the crop, then resize. cwebp drops all metadata (location, camera) by default.
  cwebp -quiet -lossless -crop $crop "$src" -o "$TMP/$name.webp"
  for w in $widths; do
    cwebp -quiet -q "$QUALITY" -resize "$w" 0 "$TMP/$name.webp" -o "$OUT/$name-$w.webp"
    sips -s format jpeg -s formatOptions "$QUALITY" --resampleWidth "$w" "$TMP/$name.webp" --out "$OUT/$name-$w.jpg" >/dev/null
    echo "$name-$w  jpg $(wc -c < "$OUT/$name-$w.jpg" | tr -d ' ')B  webp $(wc -c < "$OUT/$name-$w.webp" | tr -d ' ')B"
  done
done
