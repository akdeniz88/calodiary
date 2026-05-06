import { config } from "../config.js";
import { getDb } from "../pb.js";
import { getDailyTotals } from "../math/daily.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * /save <name>
 * Saves the last logged food_logs entry as a reusable shortcut.
 * If a saved meal with that name already exists, it is overwritten.
 */
export async function saveHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const shortcut = parts[1]?.toLowerCase();

  if (!shortcut) {
    return ctx.reply(
      "<b>Usage:</b> /save &lt;name&gt;\n\nFirst log a meal, then run /save to bookmark it under that name.\n<b>Example:</b> <code>/save oats</code>",
      { parse_mode: "HTML" }
    );
  }

  try {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);

    // Fetch today's food logs to find the most recent one
    const result = await db.collection("food_logs").getList(1, 500, {
      filter: `date >= "${today} 00:00:00" && date <= "${today} 23:59:59"`,
    });

    if (result.items.length === 0) {
      return ctx.reply("No meals logged today. Log a meal first, then run /save.");
    }

    const last = result.items[result.items.length - 1];

    // Check if a saved meal with this name already exists → update it
    const existing = await db.collection("saved_meals").getList(1, 1, {
      filter: `name = "${shortcut}"`,
    });

    if (existing.items.length > 0) {
      await db.collection("saved_meals").update(existing.items[0].id, {
        meal_name: last.meal_name,
        calories: last.calories,
        protein: last.protein,
        fat: last.fat,
        carbs: last.carbs,
      });
    } else {
      await db.collection("saved_meals").create({
        name: shortcut,
        meal_name: last.meal_name,
        calories: last.calories,
        protein: last.protein,
        fat: last.fat,
        carbs: last.carbs,
      });
    }

    await ctx.reply(
      [
        `<b>✅ MEAL SAVED</b>`,
        `Shortcut: <code>/${shortcut}</code> → <b>${escapeHtml(last.meal_name)}</b>`,
        `${last.calories} kcal  |  P: ${last.protein}g  |  F: ${last.fat}g  |  C: ${last.carbs}g`,
        ``,
        `Log it any time with: <code>/meal ${shortcut}</code>`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[saveHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

/**
 * /meal <name>
 * Logs a previously saved meal by its shortcut name.
 */
export async function mealHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const shortcut = parts[1]?.toLowerCase();

  if (!shortcut) {
    return ctx.reply(
      "<b>Usage:</b> /meal &lt;name&gt;\n<b>Example:</b> <code>/meal oats</code>\n\nUse /meals to list all saved meals.",
      { parse_mode: "HTML" }
    );
  }

  try {
    const db = await getDb();

    const result = await db.collection("saved_meals").getList(1, 1, {
      filter: `name = "${shortcut}"`,
    });

    if (result.items.length === 0) {
      return ctx.reply(
        `No saved meal named <code>${escapeHtml(shortcut)}</code>.\n\nUse /meals to list all saved meals.`,
        { parse_mode: "HTML" }
      );
    }

    const saved = result.items[0];

    await db.collection("food_logs").create({
      meal_name: saved.meal_name,
      calories: saved.calories,
      protein: saved.protein,
      fat: saved.fat,
      carbs: saved.carbs,
      raw_input: `[saved: ${shortcut}]`,
      date: new Date().toISOString().replace("T", " ").slice(0, 19),
    });

    const today = new Date().toISOString().slice(0, 10);
    const totals = await getDailyTotals(today);

    await ctx.reply(
      [
        `<b>🍽 MEAL LOGGED</b> (saved)`,
        `<b>${escapeHtml(saved.meal_name)}</b>`,
        `${saved.calories} kcal  |  P: ${saved.protein}g  |  F: ${saved.fat}g  |  C: ${saved.carbs}g`,
        ``,
        `<b>📊 TODAY</b>`,
        `Calories: <b>${totals.totalCalories}</b> kcal  |  Remaining: <b>${totals.remainingCalories}</b>`,
        `Protein:  <b>${totals.totalProtein}g</b>  |  Remaining: <b>${totals.remainingProtein}g</b>`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[mealHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

/**
 * /meals
 * Lists all saved meal shortcuts.
 */
export async function mealsListHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  try {
    const db = await getDb();
    const result = await db.collection("saved_meals").getFullList({ sort: "name" });

    if (result.length === 0) {
      return ctx.reply(
        "No saved meals yet. Log a meal and use /save &lt;name&gt; to bookmark it.",
        { parse_mode: "HTML" }
      );
    }

    const rows = result.map(
      (m) =>
        `<code>/meal ${escapeHtml(m.name)}</code> — ${escapeHtml(m.meal_name)} (${m.calories} kcal | P: ${m.protein}g)`
    );

    await ctx.reply(
      [`<b>📋 SAVED MEALS</b>`, "", ...rows].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[mealsListHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

/**
 * /delete <name>
 * Removes a saved meal shortcut by name.
 */
export async function deleteMealHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message?.text || "";
  const shortcut = text.trim().split(/\s+/)[1]?.toLowerCase();

  if (!shortcut) {
    return ctx.reply(
      "<b>Usage:</b> /delete &lt;name&gt;\n<b>Example:</b> <code>/delete oats</code>",
      { parse_mode: "HTML" }
    );
  }

  try {
    const db = await getDb();
    const result = await db.collection("saved_meals").getList(1, 1, {
      filter: `name = "${shortcut}"`,
    });

    if (result.items.length === 0) {
      return ctx.reply(
        `No saved meal named <code>${escapeHtml(shortcut)}</code>.`,
        { parse_mode: "HTML" }
      );
    }

    await db.collection("saved_meals").delete(result.items[0].id);

    await ctx.reply(
      `<b>🗑 DELETED</b>\n<code>/meal ${escapeHtml(shortcut)}</code> (${escapeHtml(result.items[0].meal_name)}) removed.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[deleteMealHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}
