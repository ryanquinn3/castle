#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///
"""Run the project's static-check suite: tsc, lint, unit tests, knip, browser tests.

Each stage runs as a subprocess. The browser test runs in the background while the
faster stages run sequentially. Failed stages print captured output and an optional
hint message.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field


@dataclass
class Stage:
    name: str
    cmd: list[str]
    hint: str = ""
    background: bool = False
    process: subprocess.Popen[bytes] | None = field(default=None, repr=False)


STAGES: list[Stage] = [
    Stage(
        name="browser_test",
        cmd=["node", "--run", "test:browser", "--", "--reporter=minimal", "--changed"],
        background=True,
    ),
    Stage(name="tsc", cmd=["node", "--run", "tsc"]),
    Stage(name="lint", cmd=["node", "--run", "lint:fix"]),
    Stage(
        name="unit_test",
        cmd=["node", "--run", "test:unit", "--", "--reporter=minimal", "--changed"],
    ),
    Stage(
        name="knip",
        cmd=["node", "--run", "knip"],
        hint="See docs/knip-unused-policy.md for guidance on handling knip failures.",
    ),
]


def report(stage: Stage, returncode: int, output: bytes) -> bool:
    if returncode == 0:
        print(f"{stage.name} ok", flush=True)
        return True
    print(f"{stage.name} FAILED", flush=True)
    sys.stdout.buffer.write(output)
    sys.stdout.buffer.flush()
    if stage.hint:
        print()
        print(stage.hint, flush=True)
    return False


def main() -> int:
    failed = False

    for stage in STAGES:
        if stage.background:
            stage.process = subprocess.Popen(
                stage.cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
            )

    for stage in STAGES:
        if stage.background:
            continue
        completed = subprocess.run(stage.cmd, capture_output=True)
        if not report(stage, completed.returncode, completed.stdout + completed.stderr):
            failed = True

    for stage in STAGES:
        if not stage.background or stage.process is None:
            continue
        output, _ = stage.process.communicate()
        if not report(stage, stage.process.returncode, output):
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
