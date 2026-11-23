#!/bin/sh
# Makes web-ready copies of the venue photos in site/img/.
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
  "venue-bedroom:480 864"
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
