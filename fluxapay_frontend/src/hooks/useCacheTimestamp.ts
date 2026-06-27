"use client";

import { useState, useEffect } from "react";

export function useCacheTimestamp(key: string) {
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`cache_timestamp_${key}`);
    if (stored) {
      const ts = Number(stored);
      setTimestamp(ts);
      updateMinutesAgo(ts);
    }
  }, [key]);

  useEffect(() => {
    if (!timestamp) return;

    const interval = setInterval(() => {
      updateMinutesAgo(timestamp);
    }, 10000);

    return () => clearInterval(interval);
  }, [timestamp]);

  function updateMinutesAgo(ts: number) {
    const now = Date.now();
    const minutes = Math.floor((now - ts) / 60000);
    setMinutesAgo(minutes);
  }

  function recordTimestamp() {
    const now = Date.now();
    localStorage.setItem(`cache_timestamp_${key}`, String(now));
    setTimestamp(now);
    updateMinutesAgo(now);
  }

  function getFormattedTime() {
    if (minutesAgo === null) return null;
    if (minutesAgo === 0) return "Just now";
    if (minutesAgo === 1) return "1 minute ago";
    return `${minutesAgo} minutes ago`;
  }

  return { timestamp, minutesAgo, recordTimestamp, getFormattedTime };
}
