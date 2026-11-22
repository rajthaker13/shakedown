"""Run a LeRobot checkpoint in-process.

Loads any policy type through LeRobot's own factory. ACT and Diffusion Policy
have been run end to end; other types (VQ-BeT, SmolVLA, pi0 and so on) take the
same code path but have not been tested. Checkpoints saved before LeRobot moved
normalization into processor pipelines are migrated on first use and cached.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import sys
import warnings
from pathlib import Path
from typing import Any

import numpy as np

from shakedown.policies.base import Policy, PolicyError
from shakedown.types import Observation

log = logging.getLogger(__name__)

#: Options handled by this adapter rather than passed to the policy's config.
_ADAPTER_OPTIONS = {"dtype", "latency_compensation"}

#: Inference options that may be overridden from the policy spec.
_CONFIG_OVERRIDES = {
    "n_action_steps",
    "temporal_ensemble_coeff",
    "num_inference_steps",
    "n_obs_steps",
}


def _cache_dir() -> Path:
    root = os.environ.get("SHAKEDOWN_CACHE", str(Path.home() / ".cache" / "shakedown"))
    path = Path(root) / "checkpoints"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _pick_device(requested: str | None) -> str:
    import torch

    if requested and requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _has_processors(target: str) -> bool:
    local = Path(target)
    if local.is_dir():
        return (local / "policy_preprocessor.json").exists()
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import EntryNotFoundError

    try:
        hf_hub_download(target, "policy_preprocessor.json")
        return True
    except EntryNotFoundError:
        return False
    except Exception as exc:
        raise PolicyError(f"could not fetch checkpoint '{target}': {exc}") from exc


def _migrate(target: str) -> Path:
    """Convert a checkpoint with built-in normalization layers to the current format."""
    key = hashlib.sha256(target.encode()).hexdigest()[:12]
    out = _cache_dir() / f"{Path(target).name}-{key}"
    if (out / "policy_preprocessor.json").exists():
        return out
    log.info("migrating checkpoint %s to %s", target, out)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "lerobot.processor.migrate_policy_normalization",
            "--pretrained-path",
            target,
            "--output-dir",
            str(out),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or not (out / "policy_preprocessor.json").exists():
        raise PolicyError(
            f"could not migrate checkpoint '{target}':\n{proc.stderr.strip()[-2000:]}"
        )
    return out


class LeRobotPolicy(Policy):
    def __init__(self, target: str, device: str | None = None, **options: Any):
        try:
            import torch
            from lerobot.configs.policies import PreTrainedConfig
            from lerobot.policies.factory import get_policy_class, make_pre_post_processors
        except ImportError as exc:
            raise PolicyError(
                "LeRobot is not installed. From the repository, run: pip install -e 'engine[lerobot]'"
            ) from exc

        unknown = set(options) - _CONFIG_OVERRIDES - _ADAPTER_OPTIONS
        if unknown:
            raise PolicyError(
                f"unknown policy option(s): {', '.join(sorted(unknown))}. "
                f"Allowed: {', '.join(sorted(_CONFIG_OVERRIDES | _ADAPTER_OPTIONS))}"
            )

        self._torch = torch
        self.target = target
        self.device = _pick_device(device)
        self.options = dict(options)
        path = target if _has_processors(target) else str(_migrate(target))
        self.resolved_path = path

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            config = PreTrainedConfig.from_pretrained(path)
            config.device = self.device
            for key in _CONFIG_OVERRIDES & set(options):
                if not hasattr(config, key):
                    raise PolicyError(f"policy type '{config.type}' has no option '{key}'")
                setattr(config, key, options[key])
            if getattr(config, "temporal_ensemble_coeff", None) is not None:
                # ACT requires one action per inference step when ensembling.
                config.n_action_steps = 1
            policy_cls = get_policy_class(config.type)
            policy = policy_cls.from_pretrained(path, config=config)
            policy.to(self.device).eval()
            self._pre, self._post = make_pre_post_processors(
                config,
                pretrained_path=path,
                preprocessor_overrides={"device_processor": {"device": self.device}},
            )

        self.dtype = str(options.get("dtype") or "float32")
        if self.dtype == "float16":
            policy.half()
        elif self.dtype != "float32":
            raise PolicyError(f"dtype must be float32 or float16, got {self.dtype}")

        # Delay compensation: when a new chunk of actions is planned, the first
        # few are already stale by the time they would reach the robot, so they
        # are skipped. "auto" uses the delay the runner reports for each condition.
        compensation = options.get("latency_compensation", 0)
        if compensation not in ("auto", None) and not (
            isinstance(compensation, int)
            and not isinstance(compensation, bool)
            and compensation >= 0
        ):
            raise PolicyError("latency_compensation must be 'auto' or a number of steps")
        self.latency_compensation = compensation or 0
        self._skip = 0 if compensation == "auto" else int(compensation or 0)

        self.policy = policy
        self.config = config
        action = config.output_features.get("action")
        self.action_dim = int(action.shape[0]) if action is not None else None
        self._image_keys = [k for k in config.input_features if "image" in k]
        self._state_key = next(
            (k for k in config.input_features if k.endswith("observation.state")), None
        )

    # -- observation mapping --------------------------------------------------------

    def _map_images(self, obs: Observation) -> dict[str, np.ndarray]:
        """Match the environment's cameras to the image inputs the policy was trained on."""
        mapped: dict[str, np.ndarray] = {}
        for key in self._image_keys:
            camera = key.split(".")[-1]
            if camera in obs.images:
                mapped[key] = obs.images[camera]
            elif len(self._image_keys) == 1 and len(obs.images) == 1:
                mapped[key] = next(iter(obs.images.values()))
            else:
                raise PolicyError(
                    f"policy expects image input '{key}' but the environment provides "
                    f"cameras {sorted(obs.images)}"
                )
        return mapped

    def configure(self, *, action_delay_steps: int = 0) -> None:
        if self.latency_compensation == "auto":
            self._skip = int(action_delay_steps)
        if self._skip and self._skip >= int(getattr(self.config, "n_action_steps", 1)):
            raise PolicyError(
                f"cannot skip {self._skip} delayed actions when only "
                f"{self.config.n_action_steps} are executed per plan"
            )

    def _queue(self):
        """The policy's queue of planned actions, if it keeps one."""
        queue = getattr(self.policy, "_action_queue", None)
        if queue is None:
            queues = getattr(self.policy, "_queues", None)
            if isinstance(queues, dict):
                queue = queues.get("action")
        return queue

    def reset(self, seed: int) -> None:
        self._torch.manual_seed(seed)
        self.policy.reset()

    def act(self, obs: Observation) -> np.ndarray:
        torch = self._torch
        batch: dict[str, Any] = {}
        for key, img in self._map_images(obs).items():
            tensor = torch.from_numpy(np.ascontiguousarray(img)).permute(2, 0, 1).unsqueeze(0)
            batch[key] = tensor.to(torch.float32) / 255.0
        if self._state_key is not None:
            batch[self._state_key] = torch.from_numpy(obs.state).to(torch.float32).unsqueeze(0)
        batch["task"] = [obs.task]
        batch = self._pre(batch)
        if self.dtype == "float16":
            batch = {
                k: (v.half() if torch.is_tensor(v) and v.is_floating_point() else v)
                for k, v in batch.items()
            }
        queue = self._queue() if self._skip else None
        replanning = queue is not None and len(queue) == 0
        with torch.inference_mode():
            action = self.policy.select_action(batch)
            if replanning:
                # Skip the actions that would arrive after their moment has passed.
                for _ in range(self._skip):
                    if not queue:
                        break
                    action = queue.popleft()
        action = self._post(action.to(torch.float32))
        return action.to("cpu").numpy()[0].astype(np.float32)

    def describe(self) -> dict[str, Any]:
        n_params = sum(p.numel() for p in self.policy.parameters())
        info = {
            "kind": "lerobot",
            "type": self.config.type,
            "checkpoint": self.target,
            "device": self.device,
            "dtype": self.dtype,
            "parameters": n_params,
            "action_dim": self.action_dim,
            "options": {k: v for k, v in self.options.items() if k != "dtype"},
            "latency_compensation": self.latency_compensation,
        }
        weights = Path(self.resolved_path) / "model.safetensors"
        if weights.exists():
            info["weights_sha256"] = _sha256(weights)
        return json.loads(json.dumps(info, default=str))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
