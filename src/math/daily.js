import { getDb } from "../pb.js";
import { config } from "../config.js";

/**
 * Returns today's start/end timestamps as PocketBase filter strings.
 * @param {string} dateStr - "YYYY-MM-DD"
 */
function dayRange(dateStr) {
  return {
    start: `${dateStr} 00:00:00`,
    end: `${dateStr} 23:59:59`,
  };
}

/**
 * Aggregates today's food and activity data from PocketBase.
 *
 * @param {string} dateStr - "YYYY-MM-DD", defaults to today
 * @returns {Promise<{
 *   totalCalories: number,
 *   totalProtein: number,
 *   totalFat: number,
 *   totalCarbs: number,
 *   totalBurned: number,
 *   remainingCalories: number,
 *   remainingProtein: number,
 *   requiredDensity: number,
 *   mealCount: number,
 *   activityCount: number
 * }>}
 */
export async function getDailyTotals(dateStr) {
  if (!dateStr) {
    dateStr = new Date().toISOString().slice(0, 10);
  }

  const { start, end } = dayRange(dateStr);
  const db = await getDb();

  const [foodResult, activityResult] = await Promise.all([
    db.collection("food_logs").getList(1, 500, {
      filter: `date >= "${start}" && date <= "${end}"`,
    }),
    db.collection("activities").getList(1, 500, {
      filter: `date >= "${start}" && date <= "${end}"`,
    }),
  ]);

  let totalCalories = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;

  for (const row of foodResult.items) {
    totalCalories += row.calories || 0;
    totalProtein += row.protein || 0;
    totalFat += row.fat || 0;
    totalCarbs += row.carbs || 0;
  }

  let totalBurned = 0;
  for (const row of activityResult.items) {
    totalBurned += row.calories_burned || 0;
  }

  const effectiveCeiling = config.dailyCalorieCeiling + totalBurned;
  const remainingCalories = Math.max(0, effectiveCeiling - totalCalories);
  const remainingProtein = Math.max(0, config.dailyProteinFloor - totalProtein);

  // g of protein required per 100 kcal of remaining food to still hit goal
  const requiredDensity =
    remainingCalories > 0
      ? (remainingProtein / remainingCalories) * 100
      : 0;

  return {
    totalCalories: Math.round(totalCalories),
    totalProtein: Math.round(totalProtein * 10) / 10,
    totalFat: Math.round(totalFat * 10) / 10,
    totalCarbs: Math.round(totalCarbs * 10) / 10,
    totalBurned: Math.round(totalBurned * 10) / 10,
    remainingCalories: Math.round(remainingCalories),
    remainingProtein: Math.round(remainingProtein * 10) / 10,
    requiredDensity: Math.round(requiredDensity * 10) / 10,
    mealCount: foodResult.items.length,
    activityCount: activityResult.items.length,
  };
}
