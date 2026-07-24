'use client';
import { useEffect } from 'react';

// רישום Service Worker עבור ה-PWA (עבודה offline + התראות)
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
