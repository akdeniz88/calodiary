/**
 * One-time PocketBase collection migration script.
 * Run once: node setup/migrate.js
 *
 * Creates food_logs and activities collections if they don't already exist.
 * Safe to re-run — skips any collection that already exists.
 */

import "dotenv/config";
import PocketBase from "pocketbase";

const POCKETBASE_URL = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env");
  process.exit(1);
}

const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

const COLLECTIONS = [
  {
    name: "food_logs",
    type: "base",
    fields: [
      { name: "meal_name", type: "text", required: true },
      { name: "calories", type: "number", required: true },
      { name: "protein", type: "number", required: true },
      { name: "fat", type: "number", required: true },
      { name: "carbs", type: "number", required: true },
      {
        name: "image",
        type: "file",
        options: { maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
      },
      { name: "raw_input", type: "text" },
      { name: "date", type: "date", required: true },
    ],
  },
  {
    name: "activities",
    type: "base",
    fields: [
      { name: "type", type: "text", required: true },
      { name: "duration_min", type: "number", required: true },
      { name: "intensity_json", type: "json" },
      { name: "calories_burned", type: "number", required: true },
      { name: "date", type: "date", required: true },
    ],
  },
  {
    name: "saved_meals",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "meal_name", type: "text", required: true },
      { name: "calories", type: "number", required: true },
      { name: "protein", type: "number", required: true },
      { name: "fat", type: "number", required: true },
      { name: "carbs", type: "number", required: true },
    ],
  },
  {
    name: "weight_logs",
    type: "base",
    fields: [
      { name: "weight_kg", type: "number", required: true },
      { name: "date", type: "date", required: true },
    ],
  },
];

async function main() {
  console.log(`Connecting to PocketBase at ${POCKETBASE_URL}...`);
  await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Admin authenticated.");

  // Fetch existing collections
  const existing = await pb.collections.getFullList();
  const existingNames = new Set(existing.map((c) => c.name));

  for (const def of COLLECTIONS) {
    if (existingNames.has(def.name)) {
      console.log(`  ⏭ "${def.name}" already exists — skipped.`);
      continue;
    }

    await pb.collections.create({
      name: def.name,
      type: def.type,
      fields: def.fields,
    });

    console.log(`  ✓ Created collection "${def.name}"`);
  }

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
