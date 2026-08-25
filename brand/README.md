# Brand assets

Social images built from the same aurora the website uses: the warm, cool, and
blush hues in `assets/gausyn.css`, the same blur and film grain, and the same
Georgia wordmark. Nothing here is linked from the site.

## For X

| File | Size | Use |
|---|---|---|
| `x-avatar.jpg` | 1600 x 1600, 0.32 MB | Profile picture. The `g` is centred on its ink so it stays balanced inside the circular crop. |
| `x-avatar-left.jpg` | 1600 x 1600, 0.33 MB | Same, with the `g` set to the left. |
| `x-banner.jpg` | 3000 x 1000, 0.32 MB | Header. No text, so nothing collides with the avatar or the profile overlay. |

Upload the `.jpg` files. X caps a profile picture at 2 MB and the film grain
makes PNG compress badly, so the PNG masters are over that limit even though
they are the same image. The `.png` files are kept as lossless originals for
print or further editing.

The banner is 3:1, which is what X asks for. X crops the height on narrow
windows, so the composition has nothing important near the top or bottom edge.

## Regenerating

`source.html` renders every asset. Serve this folder and screenshot it at the
exact pixel size you want:

```
python3 -m http.server 8000
```

```
chrome --headless=new --hide-scrollbars \
  --window-size=1600,1600 --screenshot=x-avatar.png \
  "http://localhost:8000/brand/source.html?v=avatar"
```

`v` accepts `avatar`, `avatar-left`, or `banner`. Match `--window-size` to the
canvas size set in the stylesheet for that variant. Then convert:

```
sips -s format jpeg -s formatOptions 92 x-avatar.png --out x-avatar.jpg
```

Georgia has a deep descender, so the glyph is nudged up 20.8% of its em and
left 1.1% to centre it on its ink rather than its line box. Those numbers are
in the comment above `.mark` in `source.html`.
