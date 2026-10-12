"use client";

// Reading time tracker for Backbencher Readers
const KEY_SECONDS = "backbencher_reading_seconds_v1";
const KEY_DAYS = "backbencher_active_days_v1";
const KEY_LAST_DATE = "backbencher_last_read_date_v1";

export interface ReadingStats {
  totalMinutes: number;
  dailyAvgMinutes: number;
  level: number;
  expPercent: number;
  streakDays: number;
}

export function getReadingStats(): ReadingStats {
  if (typeof window === "undefined") {
    return {
      totalMinutes: 0,
      dailyAvgMinutes: 0,
      level: 1,
      expPercent: 0,
      streakDays: 0,
    };
  }

  try {
    const rawSec = parseInt(localStorage.getItem(KEY_SECONDS) || "0", 10);
    const totalMinutes = Math.floor(rawSec / 60);
    const days = parseInt(localStorage.getItem(KEY_DAYS) || (totalMinutes > 0 ? "1" : "0"), 10);
    const dailyAvg = days > 0 ? Math.round(totalMinutes / days) : totalMinutes;

    // Level calculation (each 30 mins is a level, starting at level 1)
    const level = Math.max(1, Math.min(10, Math.floor(totalMinutes / 30) + 1));
    const expPercent = totalMinutes === 0 ? 0 : Math.min(100, Math.max(5, (totalMinutes % 30) * 3.33));

    return {
      totalMinutes,
      dailyAvgMinutes: dailyAvg,
      level,
      expPercent: Math.round(expPercent),
      streakDays: days,
    };
  } catch {
    return {
      totalMinutes: 0,
      dailyAvgMinutes: 0,
      level: 1,
      expPercent: 0,
      streakDays: 0,
    };
  }
}

export function recordReadingHeartbeat(secondsToAdd = 10) {
  if (typeof window === "undefined") return;
  try {
    const current = parseInt(localStorage.getItem(KEY_SECONDS) || "0", 10);
    localStorage.setItem(KEY_SECONDS, String(current + secondsToAdd));

    const today = new Date().toISOString().slice(0, 10);
    const lastDate = localStorage.getItem(KEY_LAST_DATE);
    if (lastDate !== today) {
      localStorage.setItem(KEY_LAST_DATE, today);
      const days = parseInt(localStorage.getItem(KEY_DAYS) || "0", 10);
      localStorage.setItem(KEY_DAYS, String(days + 1));
    }
  } catch {}
}
