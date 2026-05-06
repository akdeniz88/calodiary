import "dotenv/config";

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function requiredInt(name) {
  const val = required(name);
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`Env var ${name} must be an integer, got: "${val}"`);
  return n;
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  allowedUserId: requiredInt("ALLOWED_USER_ID"),

  pocketbaseUrl: required("POCKETBASE_URL"),
  pocketbaseAdminEmail: required("POCKETBASE_ADMIN_EMAIL"),
  pocketbaseAdminPassword: required("POCKETBASE_ADMIN_PASSWORD"),

  openrouterApiKey: required("OPENROUTER_API_KEY"),
  openrouterModel: process.env.OPENROUTER_MODEL || "google/gemini-flash-1.5",

  userWeightKg: parseFloat(process.env.USER_WEIGHT_KG || "94"),
  dailyCalorieCeiling: parseInt(process.env.DAILY_CALORIE_CEILING || "2000", 10),
  dailyProteinFloor: parseInt(process.env.DAILY_PROTEIN_FLOOR || "160", 10),
};
