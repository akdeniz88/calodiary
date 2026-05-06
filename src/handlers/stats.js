import { config } from "../config.js";
import { getDailyTotals } from "../math/daily.js";
import { getDb } from "../pb.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Handles the /stats command.
 * Replies with a full HTML daily summary table for today.
 */
export async function statsHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const totals = await getDailyTotals(today);
    const reply = formatDailyStatus(totals, today);
    await ctx.reply(reply, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[statsHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

/**
 * Formats a full daily status HTML string.
 * Exported so photo.js can reuse it (it has full totals already).
 *
 * @param {object} totals - from getDailyTotals()
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
export function formatDailyStatus(totals, dateStr) {
  const effectiveCeiling = config.dailyCalorieCeiling + totals.totalBurned;
  const calPct = effectiveCeiling > 0 ? Math.round((totals.totalCalories / effectiveCeiling) * 100) : 0;
  const protPct = Math.round((totals.totalProtein / config.dailyProteinFloor) * 100);

  const calBar = buildProgressBar(totals.totalCalories, effectiveCeiling);
  const protBar = buildProgressBar(totals.totalProtein, config.dailyProteinFloor);

  const calStatus = totals.remainingCalories === 0 ? "⛔ CEILING HIT" : `${totals.remainingCalories} remaining`;
  const protStatus = totals.remainingProtein === 0 ? "✅ GOAL MET" : `${totals.remainingProtein}g short`;

  const lines = [
    `<b>📊 DAILY STATUS — ${dateStr}</b>`,
    ``,
    `<b>CALORIES</b>`,
    `${calBar} ${totals.totalCalories}/${effectiveCeiling} kcal (${calPct}%)`,
    `  Eaten: ${totals.totalCalories} kcal`,
    totals.totalBurned > 0 ? `  Burned: +${totals.totalBurned} kcal` : null,
    `  Status: ${calStatus}`,
    ``,
    `<b>PROTEIN</b>`,
    `${protBar} ${totals.totalProtein}/${config.dailyProteinFloor} g (${protPct}%)`,
    `  Status: ${protStatus}`,
    ``,
    `<b>MACROS</b>`,
    `  Fat:   ${totals.totalFat} g`,
    `  Carbs: ${totals.totalCarbs} g`,
    ``,
    `<b>DENSITY REQUIREMENT</b>`,
    totals.remainingCalories > 0
      ? `  Need ${totals.requiredDensity}g protein/100kcal from remaining food`
      : `  No calories remaining.`,
    ``,
    `Meals logged: ${totals.mealCount}  |  Activities: ${totals.activityCount}`,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

function buildProgressBar(current, max) {
  const filled = max > 0 ? Math.min(10, Math.round((current / max) * 10)) : 0;
  return `[${"█".repeat(filled)}${"░".repeat(10 - filled)}]`;
}

function toOsloTime(pbDate) {
  // PocketBase stores dates as "YYYY-MM-DD HH:MM:SS" in UTC
  const utc = new Date(pbDate.replace(" ", "T") + "Z");
  return utc.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
}

/**
 * Handles /log — lists every meal and activity logged today in order.
 */
export async function logHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const db = await getDb();

    const [foodResult, activityResult] = await Promise.all([
      db.collection("food_logs").getList(1, 500, {
        filter: `date >= "${today} 00:00:00" && date <= "${today} 23:59:59"`,
      }),
      db.collection("activities").getList(1, 500, {
        filter: `date >= "${today} 00:00:00" && date <= "${today} 23:59:59"`,
      }),
    ]);

    if (foodResult.items.length === 0 && activityResult.items.length === 0) {
      return ctx.reply("Nothing logged today yet.");
    }

    const lines = [`<b>📋 TODAY'S LOG — ${today}</b>`, ``];

    if (foodResult.items.length > 0) {
      lines.push(`<b>MEALS</b>`);
      foodResult.items.forEach((m, i) => {
        const time = toOsloTime(m.date);
        lines.push(
          `${i + 1}. <b>${escapeHtml(m.meal_name)}</b> <i>${time}</i>`,
          `   ${m.calories} kcal  |  P: ${m.protein}g  |  F: ${m.fat}g  |  C: ${m.carbs}g`
        );
      });
      lines.push(``);
    }

    if (activityResult.items.length > 0) {
      lines.push(`<b>ACTIVITIES</b>`);
      activityResult.items.forEach((a, i) => {
        const time = toOsloTime(a.date);
        lines.push(
          `${i + 1}. <b>${escapeHtml(a.type)}</b> <i>${time}</i>`,
          `   ${a.duration_min} min  |  ${a.calories_burned} kcal burned`
        );
      });
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("[logHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}
