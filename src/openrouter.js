import fetch from "node-fetch";
import { config } from "./config.js";
import { getActiveModel } from "./handlers/model.js";

/**
 * Sends a food image + optional caption to OpenRouter (Gemini Flash) for analysis.
 *
 * @param {string} imageBase64  - Base64-encoded image data (no prefix)
 * @param {string} mimeType     - e.g. "image/jpeg", "image/png"
 * @param {string} systemPrompt - Full system instruction string
 * @param {string} [caption]    - Optional user caption / description
 * @returns {Promise<{ meal_name: string, calories: number, protein: number, fat: number, carbs: number, critique: string }>}
 */
export async function analyzeFood(imageBase64, mimeType, systemPrompt, caption = "") {
  const userContent = [];

  if (imageBase64 && mimeType) {
    const dataUri = `data:${mimeType};base64,${imageBase64}`;
    userContent.push({
      type: "image_url",
      image_url: { url: dataUri },
    });
  }

  if (caption && caption.trim()) {
    userContent.push({
      type: "text",
      text: imageBase64 ? `User caption: "${caption.trim()}"` : caption.trim(),
    });
  }

  if (userContent.length === 0) {
    throw new Error("analyzeFood requires at least an image or a text description");
  }

  const body = {
    model: getActiveModel(),
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    temperature: 0.2, // low variance — we want consistent, factual estimates
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/calodiary",
      "X-Title": "Calodiary",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("OpenRouter returned empty content");
  }

  // Strip markdown code fences if the model ignores the instruction
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${cleaned.slice(0, 200)}`);
  }

  // Validate required fields
  const required = ["meal_name", "calories", "protein", "fat", "carbs", "critique"];
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new Error(`Gemini response missing field: "${field}"`);
    }
  }

  function toNum(val) {
    const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : Math.round(n * 10) / 10;
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item) => ({
        name: String(item.name || ""),
        calories: toNum(item.calories),
        protein: toNum(item.protein),
        fat: toNum(item.fat),
        carbs: toNum(item.carbs),
      }))
    : [];

  return {
    meal_name: String(parsed.meal_name),
    items,
    calories: toNum(parsed.calories),
    protein: toNum(parsed.protein),
    fat: toNum(parsed.fat),
    carbs: toNum(parsed.carbs),
    critique: String(parsed.critique),
  };
}

/**
 * Applies a natural-language correction to an existing meal's macro values.
 *
 * @param {{ meal_name: string, calories: number, protein: number, fat: number, carbs: number }} current
 * @param {string} instruction  - e.g. "protein should be 35g" or "set calories to 420 and fat to 12"
 * @returns {Promise<{ meal_name: string, calories: number, protein: number, fat: number, carbs: number }>}
 */
export async function parseEditInstruction(current, instruction) {
  const systemPrompt = `You are a nutrition data editor. Apply the user's correction to the current meal macro values.
Return ONLY a single minified JSON object. No markdown, no prose, no code fences.

RESPONSE SCHEMA (all fields required, all numbers as non-negative integers):
{"meal_name": string, "calories": number, "protein": number, "fat": number, "carbs": number}

Rules:
- Apply the correction to the affected fields only; keep all other values unchanged.
- meal_name: only change if the user explicitly renames the meal, otherwise preserve it exactly.
- All numeric values must be non-negative integers.`;

  const userMessage =
    `Current meal: "${current.meal_name}"\n` +
    `Calories: ${current.calories} kcal\n` +
    `Protein: ${current.protein}g\n` +
    `Fat: ${current.fat}g\n` +
    `Carbs: ${current.carbs}g\n\n` +
    `Correction: "${instruction}"`;

  const body = {
    model: getActiveModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.1,
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/calodiary",
      "X-Title": "Calodiary",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;

  if (!raw) throw new Error("OpenRouter returned empty content");

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned non-JSON edit response: ${cleaned.slice(0, 200)}`);
  }

  const required = ["meal_name", "calories", "protein", "fat", "carbs"];
  for (const field of required) {
    if (parsed[field] === undefined) throw new Error(`Edit response missing field: "${field}"`);
  }

  function toInt(val) {
    const n = Math.round(parseFloat(String(val).replace(/[^0-9.\-]/g, "")));
    return isNaN(n) || n < 0 ? 0 : n;
  }

  return {
    meal_name: String(parsed.meal_name),
    calories: toInt(parsed.calories),
    protein: toInt(parsed.protein),
    fat: toInt(parsed.fat),
    carbs: toInt(parsed.carbs),
  };
}
