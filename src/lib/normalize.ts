import type { ProductIdentity } from './types';
import {
  ANIMAL_SYNONYMS,
  PART_SYNONYMS,
  STATE_SYNONYMS,
  canonicalize,
  normalizeText,
} from './dictionary';

const WEIGHT_RE = /(\d+[.,]?\d*)\s*(ק"?ג|קג|kg|k"?g|גרם|g)\b/i;
const RANGE_RE = /(\d{3,4})\s*[\/\-]\s*(\d{3,4})/; // למשל 700/900
const BARCODE_RE = /\b(\d{8,14})\b/;
const SKU_RE = /\b(\d{4,6}[-\/]?\d{0,6})\b/;

/**
 * נרמול טקסט תווית (ואופציונלית זהות ראשונית מהמנוע) לזהות מוצר קנונית.
 * מכסה עברית / אנגלית / הונגרית / צרפתית ועמיד לשגיאות OCR קלות.
 */
export function normalizeIdentity(
  rawText: string,
  hint?: Partial<ProductIdentity> | null
): ProductIdentity {
  const text = rawText || '';

  const animal =
    canonicalize(text, ANIMAL_SYNONYMS) ??
    (hint?.animal ? canonicalize(hint.animal, ANIMAL_SYNONYMS) : null);

  const part =
    canonicalize(text, PART_SYNONYMS) ??
    (hint?.part ? canonicalize(hint.part, PART_SYNONYMS) : null);

  const state =
    canonicalize(text, STATE_SYNONYMS) ??
    (hint?.state ? canonicalize(hint.state, STATE_SYNONYMS) : null);

  const weightMatch = text.match(WEIGHT_RE) || text.match(RANGE_RE);
  const weight = hint?.weight ?? (weightMatch ? weightMatch[0].trim() : null);

  const barcode = hint?.barcode ?? (text.match(BARCODE_RE)?.[1] ?? null);
  // מק"ט: נמנעים לבלבל עם ברקוד/משקל
  let sku = hint?.sku ?? null;
  if (!sku) {
    const skuMatch = normalizeText(text).match(SKU_RE);
    if (skuMatch && skuMatch[1] !== barcode) sku = skuMatch[1];
  }

  // דרגת משקל כבד: מנרמלים אך ורק את השדה הייעודי מהמנוע (grade), לא את כל הטקסט,
  // כדי לא לתפוס בטעות מספרים אחרים (תאריך/משקל/מק"ט) שעל התווית.
  const grade = normalizeLiverGrade(hint?.grade ?? null);

  // כבד פרוס: מהדגל של המנוע או מזיהוי המילה "פרוס" בטקסט (מדבקה כחולה).
  let sliced: boolean | null = null;
  if (typeof hint?.sliced === 'boolean') sliced = hint.sliced;
  if (sliced !== true && detectSliced(text)) sliced = true;

  // כוכביות: רק מספר ודאי מהמנוע. null = לא ניתן לקבוע (לא מנחשים 0).
  const stars = typeof hint?.stars === 'number' ? hint.stars : null;

  return { animal, part, state, weight, sku, barcode, grade, sliced, stars };
}

/**
 * מנרמל דרגת משקל של כבד אווז לצורה קנונית אחידה, כך שהמדבקה הכחולה
 * (למשל "600/700", "קילו+") והריבוע שעל הקרטון (למשל "6-7", "1+") ישוו נכון.
 * מיפוי: 400/600→4-6 · 600/700→6-7 · 700/900→7-9 · קילו+→1+.
 * מחזיר null אם אין דרגה ברורה (גישה שמרנית לא למנחשים).
 */
export function normalizeLiverGrade(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = normalizeText(raw); // "600/700"→"600 700" · "6-7"→"6 7" · "1+" נשמר
  if (/קילו|כילו|1\s*\+|1000|1\s*kg\s*\+|קג\s*\+|ק"?ג\s*\+/.test(t)) return '1+';
  const nums = t.match(/\d+/g);
  if (nums && nums.length >= 2) {
    const a = gradeDigit(nums[0]);
    const b = gradeDigit(nums[1]);
    if (a && b) return `${a}-${b}`;
  }
  return null;
}

/** 400→"4", 900→"9", 6→"6" (מספר מאות → ספרת מאות; ספרה בודדת נשמרת). */
function gradeDigit(n: string): string | null {
  if (!n) return null;
  if (n.length >= 3) return n[0];      // מאות: 400→4, 900→9
  if (n.length <= 2) return n;         // כבר ספרה/דרגה: 4→4
  return null;
}

/** האם התווית מציינת כבד פרוס (עברית/אנגלית/צרפתית/הונגרית). */
export function detectSliced(text: string): boolean {
  const t = normalizeText(text);
  return /פרוס|פרוסה|פרוסות|sliced|tranch|szelet/.test(t);
}

/** האם הצלחנו לזהות בוודאות את זהות המוצר (חלק + בעל חיים) */
export function isIdentified(id: ProductIdentity): boolean {
  return !!id.part && !!id.animal;
}
