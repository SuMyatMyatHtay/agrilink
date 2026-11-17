"""Durable photo bytes on serverless hosts; existing disk storage locally."""
import os
from pathlib import Path
from .config import get_settings

def mongo_photos():
    return os.getenv("VERCEL") == "1" or os.getenv("M2_PHOTO_STORE") == "mongodb"

def put(db, name, data):
    if mongo_photos():
        import hashlib
        stem, ext = os.path.splitext(name)
        name = f"{stem}_{hashlib.sha256(data).hexdigest()[:16]}{ext}"
        db.photo_blobs.update_one({"_id": name}, {"$setOnInsert": {"data": data}}, upsert=True)
    else:
        folder = Path(get_settings().upload_dir)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(data)
    return name

def get(db, name):
    if "/" in name or "\\" in name or ".." in name:
        raise FileNotFoundError(name)
    if mongo_photos():
        record = db.photo_blobs.find_one({"_id": name})
        if not record:
            raise FileNotFoundError(name)
        return bytes(record["data"])
    return (Path(get_settings().upload_dir) / name).read_bytes()
