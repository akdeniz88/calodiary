import { config } from "../config.js";
import { getDb } from "../pb.js";
import { treadmillCalories } from "../math/acsm.js";
import { getDailyTotals } from "../math/daily.js";

const USAGE = `<b>Usage:</b>
/cardio treadmill &lt;duration_min&gt; &lt;speed_kmh&gt; &lt;grade_pct&gt;

<b>Example:</b>
<code>/cardio treadmill 30 6.5 1.5</code>
→ 30 min at 6.5 km/h, 1.5% incline

/cardio other &lt;duration_min&gt; &lt;calories_burned&gt;
→ For non-treadmill activities (manual calorie entry)`;

/**
 * Handles the /cardio command.
 * Formats:
 *   /cardio treadmill <duration_min> <speed_kmh> <grade_pct>
 *   /cardio other <duration_min> <calories_burned>
 */
export async function cardioHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  // parts[0] = "/cardio", parts[1] = type, parts[2..] = args

  const type = (parts[1] || "").toLowerCase();

  try {
    let durationMin, caloriesBurned, intensityJson;

    if (type === "treadmill") {
      durationMin = parseFloat(parts[2]);
      const speedKmh = parseFloat(parts[3]);
      const gradePct = parseFloat(parts[4]);

      if ([durationMin, speedKmh, gradePct].some(isNaN)) {
        return ctx.reply(USAGE, { parse_mode: "HTML" });
      }
      if (durationMin <= 0 || speedKmh <= 0 || gradePct < 0) {
        return ctx.reply("<b>Error:</b> Values must be positive (grade ≥ 0).", { parse_mode: "HTML" });
      }

      caloriesBurned = treadmillCalories(speedKmh, gradePct, durationMin);
      intensityJson = { speed_kmh: speedKmh, grade_pct: gradePct };
    } else if (type === "other") {
      durationMin = parseFloat(parts[2]);
      caloriesBurned = parseFloat(parts[3]);

      if ([durationMin, caloriesBurned].some(isNaN)) {
        return ctx.reply(USAGE, { parse_mode: "HTML" });
      }
      if (durationMin <= 0 || caloriesBurned <= 0) {
        return ctx.reply("<b>Error:</b> Duration and calories must be positive.", { parse_mode: "HTML" });
      }

      intensityJson = {};
    } else {
      return ctx.reply(USAGE, { parse_mode: "HTML" });
    }

    // Save to PocketBase
    const db = await getDb();
    await db.collection("activities").create({
      type,
      duration_min: durationMin,
      intensity_json: intensityJson,
      calories_burned: caloriesBurned,
      date: new Date().toISOString().replace("T", " ").slice(0, 19),
    });

    // Updated daily totals
    const today = new Date().toISOString().slice(0, 10);
    const totals = await getDailyTotals(today);

    const lines = [
      `<b>🏃 ACTIVITY LOGGED</b>`,
      type === "treadmill"
        ? `Treadmill: ${durationMin} min @ ${intensityJson.speed_kmh} km/h, ${intensityJson.grade_pct}% grade`
        : `Activity (other): ${durationMin} min`,
      `Burned: <b>${caloriesBurned} kcal</b>`,
      ``,
      `<b>📊 UPDATED BUDGET</b>`,
      `Total burned today: <b>${totals.totalBurned} kcal</b>`,
      `Effective ceiling: <b>${config.dailyCalorieCeiling + totals.totalBurned} kcal</b>`,
      `Remaining: <b>${totals.remainingCalories} kcal</b>  |  <b>${totals.remainingProtein}g protein</b>`,
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("[cardioHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
