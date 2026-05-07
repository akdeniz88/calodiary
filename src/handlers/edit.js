import { config } from "../config.js";
import { getDb } from "../pb.js";
import { getDailyTotals } from "../math/daily.js";
import { parseEditInstruction } from "../openrouter.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Last logged food_logs record — set by photo/text handlers after each successful log.
// Shape: { id, meal_name, calories, protein, fat, carbs }
let lastLoggedRecord = null;

// Pending-edit state: userId → record snapshot awaiting a correction message.
const pendingEdits = new Map();

/** Called by photo.js / textHandler after successfully creating a food_log record. */
export function setLastLoggedRecord(record) {
  lastLoggedRecord = { ...record };
}

/** Returns true if the user currently has an open edit session. */
export function hasPendingEdit(userId) {
  return pendingEdits.has(userId);
}

/**
 * Processes a pending edit instruction from a plain-text message.
 * Returns true if it handled the message (so textHandler can skip normal logging).
 */
export async function handlePendingEdit(ctx) {
  const userId = ctx.from?.id;
  const pending = pendingEdits.get(userId);
  if (!pending) return false;

  const instruction = ctx.message?.text?.trim();
  if (!instruction) return false;

  // Consume the pending state immediately so a crash doesn't loop.
  pendingEdits.delete(userId);

  const processingMsg = await ctx.reply("Updating...");

  try {
    const updated = await parseEditInstruction(pending, instruction);

    const db = await getDb();
    await db.collection("food_logs").update(pending.id, {
      meal_name: updated.meal_name,
      calories: Math.round(updated.calories),
      protein: Math.round(updated.protein),
      fat: Math.round(updated.fat),
      carbs: Math.round(updated.carbs),
    });

    const today = new Date().toISOString().slice(0, 10);
    const totals = await getDailyTotals(today);

    const lines = [
      `<b>✏️ MEAL UPDATED</b>`,
      `<code>${escapeHtml(updated.meal_name)}</code>`,
      ``,
      `  Calories: <b>${Math.round(updated.calories)}</b> kcal  (was ${pending.calories})`,
      `  Protein:  <b>${Math.round(updated.protein)}g</b>  (was ${pending.protein}g)`,
      `  Fat:      <b>${Math.round(updated.fat)}g</b>  (was ${pending.fat}g)`,
      `  Carbs:    <b>${Math.round(updated.carbs)}g</b>  (was ${pending.carbs}g)`,
      ``,
      `<b>📊 TODAY NOW</b>`,
      `Calories: <b>${totals.totalCalories}</b> kcal  |  Remaining: <b>${totals.remainingCalories}</b>`,
      `Protein:  <b>${totals.totalProtein}g</b>  |  Remaining: <b>${totals.remainingProtein}g</b>`,
    ];

    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });

    // Keep lastLoggedRecord in sync with the corrected values.
    lastLoggedRecord = { ...updated, id: pending.id };
  } catch (err) {
    console.error("[handlePendingEdit]", err);
    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }

  return true;
}

/**
 * Handles the inline-button callback "edit_last".
 * Puts the user into edit mode and shows the current macro values.
 */
export async function editCallbackHandler(ctx) {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id;
  if (userId !== config.allowedUserId) return;

  if (!lastLoggedRecord) {
    await ctx.reply("No meal logged yet to edit.");
    return;
  }

  const r = lastLoggedRecord;
  pendingEdits.set(userId, { ...r });

  const lines = [
    `<b>✏️ EDITING:</b> <code>${escapeHtml(r.meal_name)}</code>`,
    ``,
    `  Calories: ${r.calories} kcal`,
    `  Protein:  ${r.protein}g`,
    `  Fat:      ${r.fat}g`,
    `  Carbs:    ${r.carbs}g`,
    ``,
    `What should I fix? Just tell me:`,
    `<i>e.g. "protein is actually 35g" or "set calories to 420 and fat to 12"</i>`,
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

/**
 * Handles the /edit command.
 * Same as the inline button but accessible without tapping it.
 */
export async function editCommandHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const userId = ctx.from?.id;

  if (!lastLoggedRecord) {
    await ctx.reply("No meal logged yet to edit.");
    return;
  }

  const r = lastLoggedRecord;
  pendingEdits.set(userId, { ...r });

  const lines = [
    `<b>✏️ EDITING:</b> <code>${escapeHtml(r.meal_name)}</code>`,
    ``,
    `  Calories: ${r.calories} kcal`,
    `  Protein:  ${r.protein}g`,
    `  Fat:      ${r.fat}g`,
    `  Carbs:    ${r.carbs}g`,
    ``,
    `What should I fix?`,
    `<i>e.g. "protein is actually 35g" or "set calories to 420 and fat to 12"</i>`,
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}
