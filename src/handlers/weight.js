import { config } from "../config.js";
import { getDb } from "../pb.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * /weight <kg>
 * Logs today's body weight and shows recent trend (last 7 entries).
 */
export async function weightHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const kg = parseFloat(parts[1]);

  if (isNaN(kg) || kg <= 0) {
    // No argument — show current weight and recent trend
    try {
      const db = await getDb();
      const history = await db.collection("weight_logs").getList(1, 7, { sort: "-date" });

      if (history.items.length === 0) {
        return ctx.reply(
          "No weight logged yet.\n<b>Usage:</b> /weight &lt;kg&gt;  e.g. <code>/weight 91.4</code>",
          { parse_mode: "HTML" }
        );
      }

      const entries = history.items.reverse();
      const latest = entries[entries.length - 1];
      const trendLines = entries.map((e) => {
        const d = e.date.slice(5, 10);
        return `<code>${d}</code>  ${e.weight_kg} kg`;
      });

      let deltaStr = "";
      if (entries.length >= 2) {
        const delta = latest.weight_kg - entries[entries.length - 2].weight_kg;
        const sign = delta > 0 ? "+" : "";
        deltaStr = `\nChange: <b>${sign}${delta.toFixed(1)} kg</b> since previous`;
      }

      return ctx.reply(
        [
          `<b>⚖️ CURRENT WEIGHT</b>`,
          `<b>${latest.weight_kg} kg</b> (${latest.date.slice(0, 10)})${deltaStr}`,
          ``,
          `<b>RECENT</b>`,
          ...trendLines,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("[weightHandler]", err);
      return ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
    }
  }

  try {
    const db = await getDb();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Upsert: if already logged today, update it
    const existing = await db.collection("weight_logs").getList(1, 1, {
      filter: `date >= "${today} 00:00:00" && date <= "${today} 23:59:59"`,
    });

    if (existing.items.length > 0) {
      await db.collection("weight_logs").update(existing.items[0].id, {
        weight_kg: kg,
        date: now.toISOString().replace("T", " ").slice(0, 19),
      });
    } else {
      await db.collection("weight_logs").create({
        weight_kg: kg,
        date: now.toISOString().replace("T", " ").slice(0, 19),
      });
    }

    // Fetch last 7 entries for trend
    const history = await db.collection("weight_logs").getList(1, 7, {
      sort: "-date",
    });

    const entries = history.items.reverse(); // oldest → newest
    const trendLines = entries.map((e) => {
      const d = e.date.slice(5, 10); // "MM-DD"
      return `<code>${d}</code>  ${e.weight_kg} kg`;
    });

    // Delta vs previous entry
    let deltaStr = "";
    if (entries.length >= 2) {
      const delta = kg - entries[entries.length - 2].weight_kg;
      const sign = delta > 0 ? "+" : "";
      deltaStr = `\nChange: <b>${sign}${delta.toFixed(1)} kg</b> since last entry`;
    }

    await ctx.reply(
      [
        `<b>⚖️ WEIGHT LOGGED — ${today}</b>`,
        `<b>${kg} kg</b>${deltaStr}`,
        ``,
        `<b>RECENT</b>`,
        ...trendLines,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[weightHandler]", err);
    await ctx.reply(`<b>Error:</b> ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
}
