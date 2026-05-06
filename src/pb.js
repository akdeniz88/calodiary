import PocketBase from "pocketbase";
import { config } from "./config.js";

const pb = new PocketBase(config.pocketbaseUrl);
pb.autoCancellation(false);

let authenticated = false;

/**
 * Authenticates as superuser on first call; subsequent calls are no-ops.
 * Uses the PocketBase v0.23+ _superusers collection.
 * @returns {Promise<PocketBase>}
 */
export async function getDb() {
  if (!authenticated) {
    await pb.collection("_superusers").authWithPassword(
      config.pocketbaseAdminEmail,
      config.pocketbaseAdminPassword
    );
    authenticated = true;
  }
  return pb;
}
