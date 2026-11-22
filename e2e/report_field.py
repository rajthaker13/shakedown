"""Report synthetic attempts through the field SDK, as a robot would. Used by the end-to-end test."""

import sys

import numpy as np

from shakedown.field import FieldClient

channel, count, success_rate, delay_ms = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
client = FieldClient()
release = client.release(channel)
assert release is not None, f"no release on {channel}"
rng = np.random.default_rng(7)
for i in range(count):
    ok = i < round(count * success_rate)
    with client.episode(release=release, robot=f"arm-{i % 3}", site="line-1", control_hz=50) as episode:
        for _ in range(20):
            episode.step(inference_ms=float(rng.normal(30, 3)))
            episode.frame(np.full((48, 64, 3), 120 if ok else 70, dtype=np.uint8))
        episode.action_delay(delay_ms + float(rng.normal(0, 10)))
        episode.finish(success=ok, intervention=not ok, intervention_reason="" if ok else "dropped the part")
client.close()
assert client.pending == 0
print(f"reported {count} for release {release.number}")
