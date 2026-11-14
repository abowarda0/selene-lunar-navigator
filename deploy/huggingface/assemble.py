"""Copy what the SELENE server needs into a folder that can be pushed to a Hugging Face Docker Space.

Usage: python deploy/huggingface/assemble.py <out-folder>
Never copies server/.env (the Gemini key goes in the Space's secrets instead) or computed points.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
FILES = [
    "server/point_server.py", "server/point_builder.py", "server/assistant.py", "server/requirements.txt",
    "spike/build_dataset.py", "spike/export_heightmaps.py", "spike/make_mock.py", "spike/data/named_sites.json",
    "web/public/data/sites.json",
]


def main() -> None:
    out = Path(sys.argv[1]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for rel in FILES:
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dst)
    lunar = out / "spike/lunar"
    if lunar.exists():
        shutil.rmtree(lunar)
    shutil.copytree(ROOT / "spike/lunar", lunar, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for name in ("Dockerfile", "README.md"):
        shutil.copy2(HERE / name, out / name)
    (out / ".gitignore").write_text("__pycache__/\n*.pyc\n.env\n")
    assert not (out / "server/.env").exists()
    print(f"assembled {sum(1 for p in out.rglob('*') if p.is_file())} files in {out}")


if __name__ == "__main__":
    main()
