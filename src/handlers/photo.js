import fetch from "node-fetch";
import { config } from "../config.js";
import { getDb } from "../pb.js";
import { analyzeFood } from "../openrouter.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { getDailyTotals } from "../math/daily.js";
import { formatDailyStatus } from "./stats.js";

/**
 * Handles plain text messages as food descriptions.
 */
export async function textHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message.text?.trim();
  if (!text || text.startsWith("/")) return;

  const processingMsg = await ctx.reply("Analyzing...");

  try {
    const today = new Date().toISOString().slice(0, 10);

    const beforeTotals = await getDailyTotals(today);
    const systemPrompt = buildSystemPrompt({
      remainingCalories: beforeTotals.remainingCalories,
      remainingProtein: beforeTotals.remainingProtein,
      requiredDensity: beforeTotals.requiredDensity,
    });

    const nutrition = await analyzeFood(null, null, systemPrompt, text);

    const db = await getDb();
    await db.collection("food_logs").create({
      meal_name: nutrition.meal_name,
      calories: Math.round(nutrition.calories),
      protein: Math.round(nutrition.protein),
      fat: Math.round(nutrition.fat),
      carbs: Math.round(nutrition.carbs),
      raw_input: text,
      date: new Date().toISOString().replace("T", " ").slice(0, 19),
    });

    const afterTotals = await getDailyTotals(today);
    const mealDensity =
      nutrition.calories > 0
        ? Math.round((nutrition.protein / nutrition.calories) * 1000) / 10
        : 0;

    const reply = buildMealReply(nutrition, mealDensity, afterTotals);
    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(reply, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[textHandler]", err);
    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

/**
 * Handles incoming Telegram photo messages.
 * Full pipeline: download → analyze via Gemini → save to PocketBase → reply.
 */
export async function photoHandler(ctx) {
  // Guard: only allow the configured user
  if (ctx.from?.id !== config.allowedUserId) return;

  const processingMsg = await ctx.reply("Analyzing...");

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Get highest-resolution photo
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];
    const caption = ctx.message.caption || "";

    // 2. Download photo from Telegram
    const file = await ctx.api.getFile(best.file_id);
    const downloadUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;

    const imgResponse = await fetch(downloadUrl);
    if (!imgResponse.ok) throw new Error(`Failed to download Telegram photo: ${imgResponse.status}`);

    const imgBuffer = await imgResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imgBuffer).toString("base64");

    // Determine MIME type from file extension
    const ext = file.file_path.split(".").pop().toLowerCase();
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    // 3. Get current daily context for the system prompt
    const beforeTotals = await getDailyTotals(today);

    const systemPrompt = buildSystemPrompt({
      remainingCalories: beforeTotals.remainingCalories,
      remainingProtein: beforeTotals.remainingProtein,
      requiredDensity: beforeTotals.requiredDensity,
    });

    // 4. Call Gemini via OpenRouter
    const nutrition = await analyzeFood(imageBase64, mimeType, systemPrompt, caption);

    // 5. Save to PocketBase (image + record)
    const db = await getDb();
    const formData = new FormData();
    formData.set("meal_name", nutrition.meal_name);
    formData.set("calories", String(Math.round(nutrition.calories)));
    formData.set("protein", String(Math.round(nutrition.protein)));
    formData.set("fat", String(Math.round(nutrition.fat)));
    formData.set("carbs", String(Math.round(nutrition.carbs)));
    formData.set("raw_input", caption);
    formData.set("date", new Date().toISOString().replace("T", " ").slice(0, 19));

    // Attach the image file
    const imgBlob = new Blob([imgBuffer], { type: mimeType });
    const imgFilename = `meal_${Date.now()}.${ext}`;
    formData.set("image", new File([imgBlob], imgFilename, { type: mimeType }));

    await db.collection("food_logs").create(formData);

    // 6. Re-query totals (now includes this meal)
    const afterTotals = await getDailyTotals(today);

    // 7. Calculate this meal's protein density
    const mealDensity =
      nutrition.calories > 0
        ? Math.round((nutrition.protein / nutrition.calories) * 1000) / 10
        : 0;

    // 8. Build reply
    const reply = buildMealReply(nutrition, mealDensity, afterTotals);

    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(reply, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[photoHandler]", err);
    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

function buildMealReply(nutrition, mealDensity, totals) {
  const proteinBar = buildProgressBar(totals.totalProtein, config.dailyProteinFloor);
  const calBar = buildProgressBar(
    totals.totalCalories,
    config.dailyCalorieCeiling + totals.totalBurned
  );

  return [
    `<b>🍽 MEAL LOGGED</b>`,
    `<code>${escapeHtml(nutrition.meal_name)}</code>`,
    `Calories: <b>${nutrition.calories}</b> kcal  |  P: <b>${nutrition.protein}g</b>  |  F: ${nutrition.fat}g  |  C: ${nutrition.carbs}g`,
    `Density: <b>${mealDensity}g/100kcal</b>`,
    ``,
    `<b>📊 TODAY</b>`,
    `Calories  ${calBar}  ${totals.totalCalories}/${config.dailyCalorieCeiling + totals.totalBurned} kcal`,
    `Protein   ${proteinBar}  ${totals.totalProtein}/${config.dailyProteinFloor} g`,
    totals.totalBurned > 0 ? `Burned:   +${totals.totalBurned} kcal` : null,
    `Remaining: <b>${totals.remainingCalories} kcal</b>  |  <b>${totals.remainingProtein}g protein</b>`,
    `Required density: <b>${totals.requiredDensity}g/100kcal</b>`,
    ``,
    `<b>⚠ CRITIQUE</b>`,
    `<i>${escapeHtml(nutrition.critique)}</i>`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function buildProgressBar(current, max) {
  const filled = Math.min(10, Math.round((current / max) * 10));
  return `[${"█".repeat(filled)}${"░".repeat(10 - filled)}]`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
