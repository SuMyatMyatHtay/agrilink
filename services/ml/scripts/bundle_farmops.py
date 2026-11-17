"""Package the existing farm-operations source into the ML deployment."""
from pathlib import Path
import shutil

def bundle():
    root = Path(__file__).resolve().parents[1]
    source = root.parents[1] / "module2" / "backend" / "app"
    target = root / "app" / "farmops"
    if not source.is_dir():
        raise RuntimeError("Farm operations source missing. Enable Include source files outside Root Directory for the ML Vercel project.")
    shutil.copytree(source, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    print("Bundled farm operations into the existing Python deployment")

if __name__ == "__main__":
    bundle()
