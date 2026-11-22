"""Perturbations on the observation and action channels.

These model what goes wrong between a robot's sensors, its policy and its
actuators: noisy or dropped camera frames, miscalibrated exposure, network
latency between an inference server and the controller.
"""

from __future__ import annotations

import io as _io
from collections import deque
from typing import ClassVar

import numpy as np
from PIL import Image, ImageFilter
from pydantic import Field

from shakedown.perturbations.base import IoPerturbation, register
from shakedown.types import Observation


def _cameras(obs: Observation, camera: str | None) -> list[str]:
    if camera is None:
        return list(obs.images)
    if camera not in obs.images:
        raise KeyError(f"camera '{camera}' not in observation (have {sorted(obs.images)})")
    return [camera]


@register
class ImageNoise(IoPerturbation):
    name: ClassVar[str] = "image_noise"
    summary: ClassVar[str] = "Additive Gaussian sensor noise on camera images."

    #: Standard deviation on the 0-255 scale.
    std: float = Field(default=10.0, ge=0, le=255)
    camera: str | None = None

    def transform_observation(self, obs, rng, step):
        if self.std == 0:
            return obs
        out = obs.copy()
        for cam in _cameras(out, self.camera):
            img = out.images[cam].astype(np.float32)
            img += rng.normal(0.0, self.std, size=img.shape).astype(np.float32)
            out.images[cam] = np.clip(img, 0, 255).astype(np.uint8)
        return out


@register
class ImageAdjust(IoPerturbation):
    name: ClassVar[str] = "image_adjust"
    summary: ClassVar[str] = "Exposure change: brightness, contrast and gamma."

    #: Multiplier on pixel intensity. 1.0 leaves the image unchanged.
    brightness: float = Field(default=1.0, ge=0, le=5)
    #: Multiplier on distance from mid-gray.
    contrast: float = Field(default=1.0, ge=0, le=5)
    gamma: float = Field(default=1.0, gt=0, le=5)
    camera: str | None = None

    def transform_observation(self, obs, rng, step):
        out = obs.copy()
        for cam in _cameras(out, self.camera):
            img = out.images[cam].astype(np.float32) / 255.0
            img = img * self.brightness
            img = (img - 0.5) * self.contrast + 0.5
            img = np.clip(img, 0.0, 1.0) ** self.gamma
            out.images[cam] = (img * 255.0 + 0.5).astype(np.uint8)
        return out


@register
class ImageBlur(IoPerturbation):
    name: ClassVar[str] = "image_blur"
    summary: ClassVar[str] = "Gaussian blur, as from a defocused or smudged lens."

    radius_px: float = Field(default=2.0, ge=0, le=50)
    camera: str | None = None

    def transform_observation(self, obs, rng, step):
        if self.radius_px == 0:
            return obs
        out = obs.copy()
        for cam in _cameras(out, self.camera):
            img = Image.fromarray(out.images[cam]).filter(ImageFilter.GaussianBlur(self.radius_px))
            out.images[cam] = np.asarray(img).copy()
        return out


@register
class ImageOcclusion(IoPerturbation):
    name: ClassVar[str] = "image_occlusion"
    summary: ClassVar[str] = "A solid patch covering part of the image."

    #: Patch center as a fraction of width and height.
    center: tuple[float, float] = (0.5, 0.5)
    #: Patch size as a fraction of width and height.
    size: tuple[float, float] = (0.2, 0.2)
    color: tuple[int, int, int] = (0, 0, 0)
    camera: str | None = None

    def transform_observation(self, obs, rng, step):
        out = obs.copy()
        for cam in _cameras(out, self.camera):
            img = out.images[cam]
            h, w = img.shape[:2]
            cx, cy = self.center[0] * w, self.center[1] * h
            pw, ph = self.size[0] * w, self.size[1] * h
            x0, x1 = int(max(0, cx - pw / 2)), int(min(w, cx + pw / 2))
            y0, y1 = int(max(0, cy - ph / 2)), int(min(h, cy + ph / 2))
            img[y0:y1, x0:x1] = np.array(self.color, dtype=np.uint8)
        return out


@register
class ImageCompression(IoPerturbation):
    name: ClassVar[str] = "image_compression"
    summary: ClassVar[str] = "JPEG artifacts, as from a compressed camera stream."

    quality: int = Field(default=30, ge=1, le=100)
    camera: str | None = None

    def transform_observation(self, obs, rng, step):
        out = obs.copy()
        for cam in _cameras(out, self.camera):
            buf = _io.BytesIO()
            Image.fromarray(out.images[cam]).save(buf, format="JPEG", quality=self.quality)
            buf.seek(0)
            out.images[cam] = np.asarray(Image.open(buf).convert("RGB")).copy()
        return out


@register
class FrameDrop(IoPerturbation):
    name: ClassVar[str] = "frame_drop"
    summary: ClassVar[str] = "Camera frames are dropped and the previous frame is repeated."

    probability: float = Field(default=0.1, ge=0, le=1)
    camera: str | None = None

    def begin_episode(self, rng):
        self._last: dict[str, np.ndarray] = {}

    def transform_observation(self, obs, rng, step):
        out = obs.copy()
        for cam in _cameras(out, self.camera):
            dropped = cam in self._last and rng.random() < self.probability
            if dropped:
                out.images[cam] = self._last[cam].copy()
            else:
                self._last[cam] = out.images[cam].copy()
        return out


@register
class ProprioNoise(IoPerturbation):
    name: ClassVar[str] = "proprio_noise"
    summary: ClassVar[str] = "Noise and constant bias on joint state, as from encoder error."

    std: float = Field(default=0.01, ge=0)
    #: Constant offset added to every state dimension.
    bias: float = 0.0

    def transform_observation(self, obs, rng, step):
        out = obs.copy()
        noise = rng.normal(0.0, self.std, size=out.state.shape) if self.std > 0 else 0.0
        out.state = (out.state + noise + self.bias).astype(obs.state.dtype)
        return out


@register
class ActionLatency(IoPerturbation):
    name: ClassVar[str] = "action_latency"
    summary: ClassVar[str] = "Actions reach the robot a fixed number of control steps late."

    steps: int = Field(default=2, ge=0, le=200)

    def begin_episode(self, rng):
        self._queue: deque[np.ndarray] = deque()

    def transform_action(self, action, rng, step):
        if self.steps == 0:
            return action
        self._queue.append(action.copy())
        if len(self._queue) <= self.steps:
            # Until the first delayed action arrives the robot holds its first command.
            return self._queue[0].copy()
        return self._queue.popleft()


@register
class ActionNoise(IoPerturbation):
    name: ClassVar[str] = "action_noise"
    summary: ClassVar[str] = "Gaussian noise on commanded actions."

    std: float = Field(default=0.01, ge=0)

    def transform_action(self, action, rng, step):
        if self.std == 0:
            return action
        noise = rng.normal(0.0, self.std, size=action.shape)
        return (action + noise).astype(action.dtype)


@register
class ActionHold(IoPerturbation):
    name: ClassVar[str] = "action_hold"
    summary: ClassVar[str] = "Commands are lost and the robot repeats its previous action."

    probability: float = Field(default=0.1, ge=0, le=1)

    def begin_episode(self, rng):
        self._last: np.ndarray | None = None

    def transform_action(self, action, rng, step):
        if self._last is not None and rng.random() < self.probability:
            return self._last.copy()
        self._last = action.copy()
        return action
