import { InlineKeyboard } from "grammy";
import { config } from "../config.js";

export const AVAILABLE_MODELS = [
  { id: "google/gemini-2.5-flash",          label: "Gemini 2.5 Flash" },
  { id: "google/gemini-3-flash-preview",    label: "Gemini 3 Flash Preview" },
  { id: "deepseek/deepseek-v4-pro",         label: "DeepSeek V4 Pro" },
];

// Runtime-mutable active model — starts from env / default.
let activeModel = config.openrouterModel;

/** Returns the currently active model ID. */
export function getActiveModel() {
  return activeModel;
}

/** Sets the active model. Throws if the id is not in AVAILABLE_MODELS. */
export function setActiveModel(id) {
  if (!AVAILABLE_MODELS.find((m) => m.id === id)) {
    throw new Error(`Unknown model: ${id}`);
  }
  activeModel = id;
}

function buildModelKeyboard() {
  const kb = new InlineKeyboard();
  for (const m of AVAILABLE_MODELS) {
    const active = m.id === activeModel;
    kb.text(`${active ? "✅ " : ""}${m.label}`, `set_model:${m.id}`).row();
  }
  return kb;
}

/** /model command — shows the current model and a selection keyboard. */
export async function modelCommandHandler(ctx) {
  if (ctx.from?.id !== config.allowedUserId) return;

  const current = AVAILABLE_MODELS.find((m) => m.id === activeModel);
  await ctx.reply(
    `<b>AI Model</b>\n\nActive: <code>${current?.label ?? activeModel}</code>\n\nSwitch to:`,
    { parse_mode: "HTML", reply_markup: buildModelKeyboard() }
  );
}

/** Inline-button callback for "set_model:<id>" */
export async function modelCallbackHandler(ctx) {
  await ctx.answerCallbackQuery();
  if (ctx.from?.id !== config.allowedUserId) return;

  const id = ctx.callbackQuery.data.replace("set_model:", "");
  try {
    setActiveModel(id);
    const current = AVAILABLE_MODELS.find((m) => m.id === id);
    // Update the message in-place so the checkmark moves.
    await ctx.editMessageText(
      `<b>AI Model</b>\n\nActive: <code>${current?.label ?? id}</code>\n\nSwitch to:`,
      { parse_mode: "HTML", reply_markup: buildModelKeyboard() }
    );
  } catch (err) {
    await ctx.reply(`<b>Error:</b> ${err.message}`, { parse_mode: "HTML" });
  }
}
