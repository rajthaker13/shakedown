"""Episode replay videos.

Each frame shows what the policy saw, after any observation perturbations,
next to an external view of the scene. Seeing the policy's actual input is
usually what explains a failure.
"""

from __future__ import annotations

from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image

FRAME_HEIGHT = 240


def _fit(img: np.ndarray, height: int = FRAME_HEIGHT) -> np.ndarray:
    h, w = img.shape[:2]
    if h == height:
        return img
    width = max(2, int(round(w * height / h / 2)) * 2)
    # Small observations (e.g. 96 px) are upscaled without smoothing so the
    # pixels the policy received stay visible.
    resample = Image.NEAREST if h < height else Image.BILINEAR
    return np.asarray(Image.fromarray(img).resize((width, height), resample))


def compose(policy_view: np.ndarray, external: np.ndarray | None) -> np.ndarray:
    left = _fit(policy_view)
    if external is None:
        return left
    return np.concatenate([left, _fit(external)], axis=1)


def write_video(frames: list[np.ndarray], path: str | Path, fps: int) -> None:
    """Encode H.264 in an MP4 container with a pixel format browsers can play."""
    if not frames:
        raise ValueError("no frames to write")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w = frames[0].shape[:2]
    # H.264 with yuv420p needs even dimensions.
    h2, w2 = h - (h % 2), w - (w % 2)
    writer = imageio.get_writer(
        str(path),
        format="FFMPEG",
        mode="I",
        fps=fps,
        codec="libx264",
        pixelformat="yuv420p",
        macro_block_size=None,
        ffmpeg_log_level="error",
        output_params=["-crf", "26", "-preset", "veryfast", "-movflags", "+faststart"],
    )
    try:
        for frame in frames:
            writer.append_data(frame[:h2, :w2])
    finally:
        writer.close()
