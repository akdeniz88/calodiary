import { config } from "../config.js";

/**
 * Calculates calories burned on a treadmill using the ACSM walking VO₂ formula.
 *
 * Formula:
 *   S  = speed_kmh × (1000/60)              [m/min]
 *   G  = grade_pct / 100                    [fraction]
 *   VO₂ = (0.1 × S) + (1.8 × S × G) + 3.5  [mL/kg/min]
 *   kcal/min = VO₂ × weight_kg × 5 / 1000
 *
 * @param {number} speedKmh   - Treadmill speed in km/h
 * @param {number} gradePct   - Incline grade as a percentage (e.g. 1.5 for 1.5%)
 * @param {number} durationMin - Duration in minutes
 * @returns {number} Total kilocalories burned, rounded to 1 decimal place
 */
export function treadmillCalories(speedKmh, gradePct, durationMin) {
  const S = speedKmh * (1000 / 60); // m/min
  const G = gradePct / 100;
  const vo2 = 0.1 * S + 1.8 * S * G + 3.5; // mL/kg/min
  const kcalPerMin = (vo2 * config.userWeightKg * 5) / 1000;
  return Math.round(kcalPerMin * durationMin * 10) / 10;
}
