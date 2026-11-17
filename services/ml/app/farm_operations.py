"""Mount Module 2 without colliding with the ML package also named app."""
import importlib
import importlib.util
import os
import sys
from pathlib import Path

def mount_farm_operations(parent):
    bundled = Path(__file__).parent / "farmops"
    local = Path(__file__).resolve().parents[3] / "module2" / "backend" / "app"
    source = bundled if os.getenv("VERCEL") == "1" or not local.is_dir() else local
    if not source.is_dir():
        raise RuntimeError("Farm operations source was not bundled; run scripts/bundle_farmops.py before deployment")
    name = "_agrilink_farmops"
    if name not in sys.modules:
        spec = importlib.util.spec_from_loader(name, loader=None, is_package=True)
        package = importlib.util.module_from_spec(spec)
        package.__path__ = [str(source)]
        sys.modules[name] = package
    # CV uses the already-installed ML code; no extra hosted AI provider required.
    if not os.getenv("M2_CV_URL"):
        os.environ["M2_CV_IN_PROCESS"] = "true"
    farmops = importlib.import_module(f"{name}.main")
    parent.mount("/farm-operations", farmops.app)
