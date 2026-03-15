from pathlib import Path
from PIL import Image

FPS = 6
FRAME_DURATION_MS = round(1000 / FPS)
CANVAS_SIZE = (480, 320)
UPSCALED_CANVAS_SIZE = (960, 640)
BORDER_SIZE = 4
BORDER_SIZE_X2 = 8
BORDER_COLOR = (255, 255, 255, 255)

REPO_ROOT = Path(__file__).resolve().parents[2]
BASE_FRAMES_DIR = REPO_ROOT / "site" / "render" / "output" / "base"
OUTPUT_PATH = REPO_ROOT / "site" / "render" / "output" / "copet-telegram-3x2.gif"
OUTPUT_BORDERED_PATH = REPO_ROOT / "site" / "render" / "output" / "copet-telegram-3x2-bordered.gif"
OUTPUT_X2_PATH = REPO_ROOT / "site" / "render" / "output" / "copet-telegram-3x2-x2.gif"
OUTPUT_BORDERED_X2_PATH = REPO_ROOT / "site" / "render" / "output" / "copet-telegram-3x2-bordered-x2.gif"
BACKGROUND_PATH = Path(r"C:\Users\Yuriy\Desktop\BACKGROUND.jpg")


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


def quantize_frame(frame: Image.Image) -> Image.Image:
    return frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=255)


def add_border(pet_frame: Image.Image, border_size: int) -> Image.Image:
    bordered = Image.new(
        "RGBA",
        (pet_frame.width + (border_size * 2), pet_frame.height + (border_size * 2)),
        BORDER_COLOR,
    )
    bordered.alpha_composite(pet_frame, dest=(border_size, border_size))
    return bordered


def save_gif(frames: list[Image.Image], output_path: Path) -> None:
    first_frame, *rest_frames = frames
    output_path.parent.mkdir(parents=True, exist_ok=True)
    first_frame.save(
        output_path,
        save_all=True,
        append_images=rest_frames,
        duration=FRAME_DURATION_MS,
        loop=0,
        optimize=False,
        disposal=2,
    )


def main() -> None:
    if not BACKGROUND_PATH.exists():
        raise FileNotFoundError(f"Background file not found: {BACKGROUND_PATH}")

    frame_paths = sorted(BASE_FRAMES_DIR.glob("frame_*.png"))
    if not frame_paths:
        raise FileNotFoundError(f"No base frames found in {BASE_FRAMES_DIR}")

    background = Image.open(BACKGROUND_PATH).convert("RGBA")
    background_frame = build_cover_background(background, CANVAS_SIZE)
    background_frame_x2 = build_cover_background(background, UPSCALED_CANVAS_SIZE)

    rendered_frames: list[Image.Image] = []
    bordered_frames: list[Image.Image] = []
    rendered_frames_x2: list[Image.Image] = []
    bordered_frames_x2: list[Image.Image] = []
    for frame_path in frame_paths:
        pet_frame = Image.open(frame_path).convert("RGBA")
        canvas = background_frame.copy()
        offset = (
            (CANVAS_SIZE[0] - pet_frame.width) // 2,
            (CANVAS_SIZE[1] - pet_frame.height) // 2,
        )
        canvas.alpha_composite(pet_frame, dest=offset)
        rendered_frames.append(quantize_frame(canvas))

        bordered_pet_frame = add_border(pet_frame, BORDER_SIZE)
        bordered_canvas = background_frame.copy()
        bordered_offset = (
            (CANVAS_SIZE[0] - bordered_pet_frame.width) // 2,
            (CANVAS_SIZE[1] - bordered_pet_frame.height) // 2,
        )
        bordered_canvas.alpha_composite(bordered_pet_frame, dest=bordered_offset)
        bordered_frames.append(quantize_frame(bordered_canvas))

        pet_frame_x2 = pet_frame.resize((pet_frame.width * 2, pet_frame.height * 2), resample=Image.Resampling.NEAREST)
        canvas_x2 = background_frame_x2.copy()
        offset_x2 = (
            (UPSCALED_CANVAS_SIZE[0] - pet_frame_x2.width) // 2,
            (UPSCALED_CANVAS_SIZE[1] - pet_frame_x2.height) // 2,
        )
        canvas_x2.alpha_composite(pet_frame_x2, dest=offset_x2)
        rendered_frames_x2.append(quantize_frame(canvas_x2))

        bordered_pet_frame_x2 = add_border(pet_frame_x2, BORDER_SIZE_X2)
        bordered_canvas_x2 = background_frame_x2.copy()
        bordered_offset_x2 = (
            (UPSCALED_CANVAS_SIZE[0] - bordered_pet_frame_x2.width) // 2,
            (UPSCALED_CANVAS_SIZE[1] - bordered_pet_frame_x2.height) // 2,
        )
        bordered_canvas_x2.alpha_composite(bordered_pet_frame_x2, dest=bordered_offset_x2)
        bordered_frames_x2.append(quantize_frame(bordered_canvas_x2))

    save_gif(rendered_frames, OUTPUT_PATH)
    save_gif(bordered_frames, OUTPUT_BORDERED_PATH)
    save_gif(rendered_frames_x2, OUTPUT_X2_PATH)
    save_gif(bordered_frames_x2, OUTPUT_BORDERED_X2_PATH)

    print(f"Saved {OUTPUT_PATH}")
    print(f"Saved {OUTPUT_BORDERED_PATH}")
    print(f"Saved {OUTPUT_X2_PATH}")
    print(f"Saved {OUTPUT_BORDERED_X2_PATH}")
    print(f"Frames: {len(rendered_frames)}")
    print(f"Canvas: {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}")
    print(f"Canvas x2: {UPSCALED_CANVAS_SIZE[0]}x{UPSCALED_CANVAS_SIZE[1]}")
    print(f"Frame duration: {FRAME_DURATION_MS} ms")


if __name__ == "__main__":
    main()
