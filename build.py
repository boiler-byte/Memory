#!/usr/bin/env python3

import sys
from pathlib import Path
from PIL import Image

SIZES = (256,)
EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def build(source_dir: Path, dist_dir: Path):
    if not source_dir.is_dir():
        raise SystemExit(f"Source directory not found: {source_dir}")

    for src in source_dir.rglob("*"):
        if not src.is_file() or src.suffix.lower() not in EXTENSIONS:
            continue

        relative = src.relative_to(source_dir)
        target_dir = dist_dir / relative.parent

        target_dir.mkdir(parents=True, exist_ok=True)

        with Image.open(src) as img:
            img = img.convert("RGBA")

            for size in SIZES:
                width, height = img.size
                new_height = round(height * size / width)

                if width <= size:
                    resized = img
                else:
                    resized = img.resize(
                        (size, new_height),
                        Image.Resampling.LANCZOS
                    )

                target = target_dir / f"{src.stem}.webp"

                if target.exists():
                    print(f"Skip: {target}")
                    continue

                resized.save(
                    target,
                    "WEBP",
                    quality=88,
                    method=6
                )

                print(f"{src} -> {target}")


def main():
    if len(sys.argv) > 3:
        print("Usage: buildimgs.py [source] [dist]")
        raise SystemExit(1)

    source_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "./source").resolve()
    dist_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "./img").resolve()

    build(source_dir, dist_dir)


if __name__ == "__main__":
    main()