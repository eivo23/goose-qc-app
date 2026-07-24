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

  return { animal, part, state, weight, sku, barcode };
}

/** האם הצלחנו לזהות בוודאות את זהות המוצר (חלק + בעל חיים) */
export function isIdentified(id: ProductIdentity): boolean {
  return !!id.part && !!id.animal;
}
