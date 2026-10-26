"""Rebuild checked-in runtime WebP images. Requires Python 3 and Pillow."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
jobs = [
    ("air-poker-v1/usogui-page-assets/manga-introduction-background.png", "scene.webp", None),
    ("air-poker-v1/usogui-page-assets/manga-introduction-background.png", "scene-mobile.webp", 960),
    ("air-poker-v2/tutorial.png", "tutorial.webp", None),
    ("air-poker-v2/victory.png", "victory.webp", None),
    ("air-poker-v2/defeat.png", "defeat.webp", None),
]
output = ROOT / "assets" / "runtime"
output.mkdir(parents=True, exist_ok=True)
for source, target, width in jobs:
    with Image.open(ROOT / "assets" / "generated" / source) as image:
        if width:
            image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        # Preserve RGBA, particularly the transparent victory illustration.
        image.save(output / target, format="WEBP", quality=88, method=6)
print("Runtime WebP images prepared; source PNGs are preserved.")
