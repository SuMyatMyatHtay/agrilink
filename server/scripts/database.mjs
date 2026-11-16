import mongoose from "mongoose";
import { writeFile } from "node:fs/promises";
import { env } from "../src/config/env.js";
import { models, initializeDatabase, connectDatabase } from "../src/database.js";

const command = process.argv[2];
try {
  if (command === "schema") {
    const schema = models.map((model) => ({
      collection: model.collection.name,
      model: model.modelName,
      fields: Object.fromEntries(Object.entries(model.schema.paths).map(([key, p]) => [key, {
        type: p.instance, required: !!p.isRequired,
        ...(p.options.ref && { ref: p.options.ref }),
        ...(p.enumValues?.length && { enum: p.enumValues }),
      }])),
      indexes: model.schema.indexes(),
    }));
    await writeFile(new URL("../../docs/DATABASE_SCHEMA.json", import.meta.url), JSON.stringify(schema, null, 2) + "\n");
    console.log("Generated docs/DATABASE_SCHEMA.json from the actual Mongoose models");
  } else if (["init", "check"].includes(command)) {
    await connectDatabase(env.mongo);
    await mongoose.connection.db.admin().ping();
    if (command === "init") await initializeDatabase();
    console.log(command === "init" ? "Database collections and indexes ready; existing data retained" : "Database connection OK");
  } else throw new Error("Use init, check, or schema");
} catch {
  // Do not print connection strings / driver errors which may contain credentials.
  console.error("Database command failed. Check MONGO_URI, Atlas network access, database permissions, and existing index conflicts.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
