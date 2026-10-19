from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = Path(__file__).resolve().parent / "dist"
BUILD = Path(__file__).resolve().parent / "build"


def main() -> int:
    import os

    os.environ.setdefault(
        "PYINSTALLER_CONFIG_DIR",
        str(Path(tempfile.gettempdir()) / "uzclip-pyinstaller-cache"),
    )
    if sys.platform not in {"darwin", "win32", "linux"}:
        raise SystemExit("The Python worker is not supported on this platform.")
    if importlib_util_find("PyInstaller") is None:
        raise SystemExit(
            "PyInstaller is missing. Install worker/requirements-build.txt in the Python "
            "environment used to run this command."
        )

    shutil.rmtree(DIST / "uzclip-worker", ignore_errors=True)
    shutil.rmtree(BUILD, ignore_errors=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        "uzclip-worker",
        "--distpath",
        str(DIST),
        "--workpath",
        str(BUILD),
        "--specpath",
        str(BUILD),
        "--paths",
        str(ROOT),
        "--collect-all",
        "faster_whisper",
        "--collect-all",
        "ctranslate2",
        "--collect-all",
        "av",
        "--collect-all",
        "huggingface_hub",
        str(Path(__file__).resolve().parent / "main.py"),
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    executable = "uzclip-worker.exe" if sys.platform == "win32" else "uzclip-worker"
    bundle = DIST / "uzclip-worker"
    if not (bundle / executable).is_file():
        raise SystemExit("PyInstaller did not create the expected worker executable.")
    if sys.platform == "linux":
        # Let the Linux distribution provide its baseline runtime libraries. PyInstaller
        # otherwise copies the newer build-host versions into the app bundle.
        for library in ("libmvec.so.1", "libstdc++.so.6", "libgcc_s.so.1"):
            (bundle / "_internal" / library).unlink(missing_ok=True)
    return 0


def importlib_util_find(name: str) -> str | None:
    from importlib.util import find_spec

    spec = find_spec(name)
    return spec.origin if spec else None


if __name__ == "__main__":
    raise SystemExit(main())
