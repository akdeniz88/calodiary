import { config } from "../config.js";
import { getDb } from "../pb.js";
import { getDailyTotals } from "../math/daily.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// In-memory store for the last undone entry so /redo can restore it.
// { collection: "food_logs"|"activities", data: object }
let lastUndo = null;

/**
 * Handles /undo [cardio]
 *   /undo         — removes the most recent food_logs entry today
 *   /undo cardio  — removes the most recent activities entry today
 */
export async function undoHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message?.text || "";
  const arg = text.trim().split(/\s+/)[1]?.toLowerCase();
  const isCardio = arg === "cardio";

  try {
    const today = new Date().toISOString().slice(0, 10);
    const db = await getDb();

    if (isCardio) {
      // --- Undo last activity ---
      const result = await db.collection("activities").getList(1, 500, {
        filter: `date >= "${today} 00:00:00" && date <= "${today} 23:59:59"`,
      });

      if (result.items.length === 0) {
        await ctx.reply("No cardio logged today to undo.");
        return;
      }

      const last = result.items[result.items.length - 1];
      await db.collection("activities").delete(last.id);
      lastUndo = { collection: "activities", data: { ...last } };

      const totals = await getDailyTotals(today);

      await ctx.reply(
        [
          `<b>↩ CARDIO UNDONE</b>`,
          `Removed: <b>${escapeHtml(last.type)}</b> — ${last.duration_min} min, ${last.calories_burned} kcal burned`,
          ``,
          `<b>📊 UPDATED BUDGET</b>`,
          `Total burned today: <b>${totals.totalBurned} kcal</b>`,
          `Remaining: <b>${totals.remainingCalories} kcal</b>  |  <b>${totals.remainingProtein}g protein</b>`,
          ``,
          `Run /redo to restore it.`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } else {
      // --- Undo last food log ---
      const result = await db.collection("food_logs").getList(1, 500, {
        filter: `date >= "${today} 00:00:00" && date <= "${today} 23:59:59"`,
      });

      if (result.items.length === 0) {
        await ctx.reply("Nothing logged today to undo.");
        return;
      }

      const last = result.items[result.items.length - 1];
      await db.collection("food_logs").delete(last.id);
      lastUndo = { collection: "food_logs", data: { ...last } };

      const totals = await getDailyTotals(today);

      await ctx.reply(
        [
          `<b>↩ UNDONE</b>`,
          `Removed: <code>${escapeHtml(last.meal_name)}</code>`,
          `Was: ${last.calories} kcal  |  P: ${last.protein}g  |  F: ${last.fat}g  |  C: ${last.carbs}g`,
          ``,
          `<b>📊 TODAY NOW</b>`,
          `Calories: <b>${totals.totalCalories}</b> kcal  |  Remaining: <b>${totals.remainingCalories}</b>`,
          `Protein:  <b>${totals.totalProtein}g</b>  |  Remaining: <b>${totals.remainingProtein}g</b>`,
          ``,
          `Run /redo to restore it.`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("[undoHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

/**
 * Handles /redo — re-creates the last entry removed by /undo.
 */
export async function redoHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  if (!lastUndo) {
    await ctx.reply("Nothing to redo. Use /undo first.");
    return;
  }

  try {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const { collection, data } = lastUndo;

    // Strip PocketBase meta fields before re-inserting
    const { id, created, updated, collectionId, collectionName, ...fields } = data;

    // Restore the timestamp to now
    fields.date = new Date().toISOString().replace("T", " ").slice(0, 19);

    await db.collection(collection).create(fields);
    lastUndo = null; // consume — can only redo once

    const totals = await getDailyTotals(today);

    if (collection === "activities") {
      await ctx.reply(
        [
          `<b>↪ REDO — CARDIO RESTORED</b>`,
          `Re-logged: <b>${escapeHtml(fields.type)}</b> — ${fields.duration_min} min, ${fields.calories_burned} kcal burned`,
          ``,
          `<b>📊 UPDATED BUDGET</b>`,
          `Total burned today: <b>${totals.totalBurned} kcal</b>`,
          `Remaining: <b>${totals.remainingCalories} kcal</b>  |  <b>${totals.remainingProtein}g protein</b>`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply(
        [
          `<b>↪ REDO — MEAL RESTORED</b>`,
          `Re-logged: <code>${escapeHtml(fields.meal_name)}</code>`,
          `${fields.calories} kcal  |  P: ${fields.protein}g  |  F: ${fields.fat}g  |  C: ${fields.carbs}g`,
          ``,
          `<b>📊 TODAY NOW</b>`,
          `Calories: <b>${totals.totalCalories}</b> kcal  |  Remaining: <b>${totals.remainingCalories}</b>`,
          `Protein:  <b>${totals.totalProtein}g</b>  |  Remaining: <b>${totals.remainingProtein}g</b>`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("[redoHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}
