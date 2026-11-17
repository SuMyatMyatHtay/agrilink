import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  _id: String,
  data: { type: Buffer, required: true },
  sha256: { type: String, required: true },
  size: { type: Number, required: true },
}, { timestamps: true });
const StoredDocument = mongoose.models.AgreementDocument || mongoose.model("AgreementDocument", documentSchema);

// PDFs survive cold starts and deployments. Atomic inserts preserve write-once keys.
export function createMongoStore() {
  return {
    kind: "MongoDB write-once documents",
    async putOnce(key, buf) {
      if (buf.length > 12 * 1024 * 1024) throw new Error("Agreement PDF exceeds the 12 MB storage limit");
      const digest = sha256(buf);
      try { await StoredDocument.create({ _id: key, data: buf, sha256: digest, size: buf.length }); }
      catch (error) {
        if (error.code === 11000) { const duplicate = new Error("Document key already exists"); duplicate.code = "EEXIST"; throw duplicate; }
        throw error;
      }
      return { key, sha256: digest, size: buf.length };
    },
    async get(key) {
      const doc = await StoredDocument.findById(key);
      if (!doc) { const missing = new Error("Document not found"); missing.code = "ENOENT"; throw missing; }
      return Buffer.from(doc.data);
    },
  };
}

/**
 * Write-once, versioned document store (local stand-in for AWS S3 with Versioning + Object Lock).
 * Keys look like  AGL-2026-00001/v1-signed.pdf . An existing key can never be overwritten ("wx" flag).
 */
const ROOT = process.env.DOC_STORE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../storage/agreements");

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function createStore(root) {
  if (root === undefined && (process.env.VERCEL === "1" || process.env.DOC_STORE_BACKEND === "mongodb")) return createMongoStore();
  root ??= ROOT;
  return {
    kind: "Local write-once store",
    root,
    async putOnce(key, buf) {
      const file = path.join(root, key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const fh = await fs.open(file, "wx"); // throws EEXIST instead of overwriting
      try { await fh.writeFile(buf); } finally { await fh.close(); }
      return { key, sha256: sha256(buf), size: buf.length };
    },
    async get(key) {
      return fs.readFile(path.join(root, key));
    },
  };
}
