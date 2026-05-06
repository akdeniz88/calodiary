import { config } from "../config.js";
import { getDailyTotals } from "../math/daily.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * /week — shows a 7-day summary (today + 6 previous days).
 */
export async function weekHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const results = await Promise.all(days.map((d) => getDailyTotals(d)));

    // Compute averages over days that had at least one meal logged
    const activeDays = results.filter((r) => r.mealCount > 0);
    const avg = (key) =>
      activeDays.length > 0
        ? Math.round(activeDays.reduce((s, r) => s + r[key], 0) / activeDays.length)
        : 0;

    const rows = days.map((dateStr, i) => {
      const r = results[i];
      const effectiveCeiling = config.dailyCalorieCeiling + r.totalBurned;
      const calStatus =
        r.mealCount === 0
          ? "—"
          : r.totalCalories > effectiveCeiling
          ? "⛔"
          : "✅";
      const protStatus =
        r.mealCount === 0 ? "—" : r.totalProtein >= config.dailyProteinFloor ? "✅" : "❌";
      const label = dateStr.slice(5); // "MM-DD"
      return `<code>${label}</code>  ${String(r.totalCalories).padStart(4)} kcal  P:${String(r.totalProtein).padStart(4)}g  🔥${r.totalBurned}  ${calStatus}cal ${protStatus}prot`;
    });

    const lines = [
      `<b>📅 7-DAY SUMMARY</b>`,
      ``,
      `<code>DATE   CALORIES      PROTEIN  BURN</code>`,
      ...rows,
      ``,
      `<b>AVERAGES</b> (${activeDays.length} logged days)`,
      `  Calories: <b>${avg("totalCalories")} kcal</b>`,
      `  Protein:  <b>${avg("totalProtein")}g</b>`,
      `  Burned:   <b>${avg("totalBurned")} kcal</b>`,
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("[weekHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}
