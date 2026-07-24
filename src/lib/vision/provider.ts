import type { ExtractedLabel } from '../types';

/** קרטון שזוהה בתמונה: זוג של מדבקה כחולה + תווית יצרן */
export interface DetectedCarton {
  blue: ExtractedLabel | null;
  carton: ExtractedLabel | null;
  pairingConfidence: number; // 0-100 - כמה בטוחים בהצמדה
}

export interface AnalyzeImageInput {
  base64: string;      // תוכן התמונה ב-base64 (ללא prefix של data URL)
  mime: string;        // image/jpeg וכו'
}

/**
 * חוזה אחיד למנוע ה-Vision. מאפשר בעתיד להחליף ספק (Google/Azure)
 * בלי לשכתב את לוגיקת ההשוואה. כרגע קיים מימוש אמיתי אחד: OpenAI Vision.
 */
export interface VisionProvider {
  name: string;
  analyzeImage(input: AnalyzeImageInput): Promise<DetectedCarton[]>;
}

let cached: VisionProvider | null = null;

/** מחזיר את מנוע ה-Vision האמיתי (OpenAI Vision). */
export async function getVisionProvider(): Promise<VisionProvider> {
  if (cached) return cached;
  const { OpenAIVisionProvider } = await import('./openai');
  cached = new OpenAIVisionProvider();
  return cached;
}
