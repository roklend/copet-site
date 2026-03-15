from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image

FPS = 6
CANVAS_SIZE = (960, 640)
BORDER_SIZE = 8
BORDER_COLOR = (255, 255, 255, 255)

REPO_ROOT = Path(__file__).resolve().parents[2]
BASE_FRAMES_DIR = REPO_ROOT / "site" / "render" / "output" / "base"
OUTPUT_DIR = REPO_ROOT / "site" / "render" / "output"
TEMP_ROOT = OUTPUT_DIR / "mp4_frames_x2"
PLAIN_TEMP_DIR = TEMP_ROOT / "plain"
BORDERED_TEMP_DIR = TEMP_ROOT / "bordered"
PLAIN_OUTPUT = OUTPUT_DIR / "copet-telegram-3x2-x2.mp4"
BORDERED_OUTPUT = OUTPUT_DIR / "copet-telegram-3x2-bordered-x2.mp4"
BACKGROUND_PATH = Path(r"C:\Users\Yuriy\Desktop\BACKGROUND.jpg")
FFMPEG_PATH = Path(r"C:\Program Files\KeyShot11\bin\ffmpeg.exe")


def build_cover_background(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_width, target_height = size
    src_width, src_height = source.size
    scale = max(target_width / src_width, target_height / src_height)
    scaled = source.resize(
        (round(src_width * scale), round(src_height * scale)),
        resample=Image.Resampling.NEAREST,
    )
    left = (scaled.width - target_width) // 2
    top = (scaled.height - target_height) // 2
    return scaled.crop((left, top, left + target_width, top + target_height))


def add_border(pet_frame: Image.Image, border_size: int) -> Image.Image:
    bordered = Image.new(
        "RGBA",
        (pet_frame.width + (border_size * 2), pet_frame.height + (border_size * 2)),
        BORDER_COLOR,
    )
    bordered.alpha_composite(pet_frame, dest=(border_size, border_size))
    return bordered


def prepare_temp_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def render_frame_series(output_dir: Path, bordered: bool) -> int:
    prepare_temp_directory(output_dir)

    if not BACKGROUND_PATH.exists():
        raise FileNotFoundError(f"Background file not found: {BACKGROUND_PATH}")
    if not BASE_FRAMES_DIR.exists():
        raise FileNotFoundError(f"Base frame directory not found: {BASE_FRAMES_DIR}")

    frame_paths = sorted(BASE_FRAMES_DIR.glob("frame_*.png"))
    if not frame_paths:
        raise FileNotFoundError(f"No base frames found in {BASE_FRAMES_DIR}")

    background = Image.open(BACKGROUND_PATH).convert("RGBA")
    background_frame = build_cover_background(background, CANVAS_SIZE)

    for index, frame_path in enumerate(frame_paths, start=1):
        pet_frame = Image.open(frame_path).convert("RGBA")
        pet_frame = pet_frame.resize((pet_frame.width * 2, pet_frame.height * 2), resample=Image.Resampling.NEAREST)
        if bordered:
            pet_frame = add_border(pet_frame, BORDER_SIZE)

        canvas = background_frame.copy()
        offset = (
            (CANVAS_SIZE[0] - pet_frame.width) // 2,
            (CANVAS_SIZE[1] - pet_frame.height) // 2,
        )
        canvas.alpha_composite(pet_frame, dest=offset)
        canvas.save(output_dir / f"frame_{index:04}.png")

    return len(frame_paths)


def encode_mp4(frame_dir: Path, output_path: Path) -> None:
    if not FFMPEG_PATH.exists():
        raise FileNotFoundError(f"ffmpeg not found: {FFMPEG_PATH}")

    command = [
        str(FFMPEG_PATH),
        "-y",
        "-framerate",
        str(FPS),
        "-i",
        str(frame_dir / "frame_%04d.png"),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "12",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    subprocess.run(command, check=True)


def main() -> None:
    plain_count = render_frame_series(PLAIN_TEMP_DIR, bordered=False)
    bordered_count = render_frame_series(BORDERED_TEMP_DIR, bordered=True)

    encode_mp4(PLAIN_TEMP_DIR, PLAIN_OUTPUT)
    encode_mp4(BORDERED_TEMP_DIR, BORDERED_OUTPUT)

    print(f"Saved {PLAIN_OUTPUT}")
    print(f"Saved {BORDERED_OUTPUT}")
    print(f"Frames: plain={plain_count}, bordered={bordered_count}")
    print(f"Canvas: {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}")
    print(f"FPS: {FPS}")


if __name__ == "__main__":
    main()
