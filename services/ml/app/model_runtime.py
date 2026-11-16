import os


def require_bundled_model(path):
    """Do not attempt training/writing to Vercel's read-only function filesystem."""
    if os.getenv("VERCEL") and not path.is_file():
        raise RuntimeError("Bundled ML artifact missing. Run python scripts/prepare_models.py during the Vercel build.")
