import { Bot } from "grammy";
import { config } from "./config.js";
import { getDb } from "./pb.js";
import { photoHandler, textHandler } from "./handlers/photo.js";
import { cardioHandler } from "./handlers/cardio.js";
import { statsHandler, logHandler } from "./handlers/stats.js";
import { undoHandler, redoHandler } from "./handlers/undo.js";
import { saveHandler, mealHandler, mealsListHandler, deleteMealHandler } from "./handlers/savedmeal.js";
import { weekHandler } from "./handlers/week.js";
import { weightHandler } from "./handlers/weight.js";

const bot = new Bot(config.telegramToken);

// /start — basic acknowledgement
bot.command("start", (ctx) => {
  if (ctx.from?.id !== config.allowedUserId) return;
  ctx.reply(
    "<b>Calodiary online.</b>\n\nSend a food photo (with optional caption) to log a meal.\n\n" +
      "<b>Commands:</b>\n" +
      "/stats — today's summary\n" +
      "/log — everything logged today\n" +
      "/week — 7-day summary\n" +
      "/undo — remove last logged entry  (add 'cardio' for activities)\n" +
      "/redo — restore the last undone entry\n" +
      "/save &lt;name&gt; — bookmark last meal as a shortcut\n" +
      "/meal &lt;name&gt; — log a saved meal instantly\n" +
      "/meals — list all saved meals\n" +
      "/delete &lt;name&gt; — remove a saved meal shortcut\n" +
      "/weight &lt;kg&gt; — log body weight\n" +
      "/cardio treadmill &lt;min&gt; &lt;km/h&gt; &lt;grade%&gt;\n" +
      "/cardio other &lt;min&gt; &lt;kcal_burned&gt;",
    { parse_mode: "HTML" }
  );
});

// Photo messages → food log pipeline
bot.on("message:photo", photoHandler);

// Commands — registered before message:text so they are not intercepted
bot.command("cardio", cardioHandler);
bot.command("stats", statsHandler);
bot.command("log", logHandler);
bot.command("undo", undoHandler);
bot.command("redo", redoHandler);
bot.command("save", saveHandler);
bot.command("meal", mealHandler);
bot.command("meals", mealsListHandler);
bot.command("delete", deleteMealHandler);
bot.command("week", weekHandler);
bot.command("weight", weightHandler);

// Plain text messages → text-only food log pipeline (commands already handled above)
bot.on("message:text", textHandler);

// Global error handler
bot.catch((err) => {
  console.error("[bot.catch]", err);
});

// Warm up PocketBase admin session before accepting messages
getDb()
  .then(async () => {
    console.log("PocketBase: authenticated");

    await bot.api.setMyCommands([
      { command: "start",  description: "Show help and available commands" },
      { command: "stats",  description: "Today's calorie & macro summary" },
      { command: "log",    description: "List everything logged today (meals & activities)" },
      { command: "undo",   description: "Remove last meal (/undo) or cardio (/undo cardio)" },
      { command: "redo",   description: "Restore the last entry removed by /undo" },
      { command: "save",   description: "Save last meal as a shortcut  /save <name>" },
      { command: "meal",   description: "Log a saved meal instantly  /meal <name>" },
      { command: "meals",  description: "List all saved meal shortcuts" },
      { command: "delete", description: "Remove a saved meal shortcut  /delete <name>" },
      { command: "week",   description: "7-day calorie & protein summary" },
      { command: "weight", description: "Log body weight  /weight <kg>  or  /weight to check current" },
      { command: "cardio", description: "Log cardio  /cardio treadmill <min> <km/h> <grade%>" },
    ]);
    console.log("Telegram command menu registered.");

    return bot.start({
      onStart: (info) => console.log(`Bot started: @${info.username}`),
    });
  })
  .catch((err) => {
    console.error("Startup error:", err.message);
    process.exit(1);
  });
