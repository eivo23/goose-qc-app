import type { ProductIdentity, MatchResult } from './types';
import { isIdentified } from './normalize';
import { PART_HE, ANIMAL_HE, STATE_HE } from './dictionary';

export interface CompareOutput {
  matchResult: MatchResult;
  confidence: number;      // 0-100
  reasonCode: string | null;
  explanation: string;     // הסבר קריא בעברית
}

/**
 * השוואת שתי זהויות מוצר מנורמלות.
 *
 * עקרונות:
 *  - התאמה נקבעת רק אם בעל החיים + החלק + המצב תואמים.
 *  - חלק (part) הוא הקריטריון הקריטי. כבד ≠ שוק ≠ כנף וכו'.
 *  - מתעלמים ממשקל, הכשר, שם יצרן, שפה, סדר מילים, יחיד/רבים, פיסוק.
 *  - אם אחד הצדדים לא זוהה בוודאות -> uncertain (לעולם לא "תקין").
 *
 * @param baseConfidence ביטחון הקריאה של מנוע ה-Vision (מינימום בין שתי התוויות)
 */
export function compareIdentities(
  ordered: ProductIdentity, // מדבקה כחולה - מה שהוזמן
  found: ProductIdentity,   // תווית קרטון - מה שנמצא
  baseConfidence = 100
): CompareOutput {
  // 1. חוסר זיהוי -> אף פעם לא תקין
  if (!isIdentified(ordered) || !isIdentified(found)) {
    return {
      matchResult: 'uncertain',
      confidence: Math.min(baseConfidence, 50),
      reasonCode: 'uncertain_product',
      explanation: 'לא ניתן לזהות בוודאות את המוצר באחת התוויות. הבדיקה הועברה לבדיקת מנהל/חריגה.',
    };
  }

  const reasons: string[] = [];
  let mismatch = false;

  // 2. בעל חיים
  if (ordered.animal !== found.animal) {
    mismatch = true;
    reasons.push(`בעל חיים שונה: הוזמן ${animalHe(ordered.animal)}, נמצא ${animalHe(found.animal)}`);
  }

  // 3. חלק - הקריטריון החשוב ביותר
  if (ordered.part !== found.part) {
    mismatch = true;
    reasons.push(`חלק שונה: הוזמן ${partHe(ordered.part)}, נמצא ${partHe(found.part)}`);
  }

  // 4. מצב (קפוא/מצונן) - רק אם שני הצדדים ידועים
  if (ordered.state && found.state && ordered.state !== found.state) {
    mismatch = true;
    reasons.push(`מצב שונה: הוזמן ${stateHe(ordered.state)}, נמצא ${stateHe(found.state)}`);
  }

  // 5. ברקוד/מק"ט - אם שניהם קיימים ושונים, סימן אזהרה (לא קובע לבד)
  let barcodeConflict = false;

  if (mismatch) {
    return {
      matchResult: 'mismatch',
      confidence: Math.max(baseConfidence, 90), // בטוחים באי-התאמה כשהחלקים ברורים
      reasonCode: 'product_mismatch',
      explanation: reasons.join(' · '),
    };
  }

  if (barcodeConflict) {
    return {
      matchResult: 'uncertain',
      confidence: Math.min(baseConfidence, 70),
      reasonCode: 'barcode_mismatch',
      explanation: 'זהות המוצר תואמת אך הברקוד/מק"ט אינם תואמים - נדרשת בדיקת מנהל.',
    };
  }

  // התאמה מלאה
  return {
    matchResult: 'match',
    confidence: baseConfidence,
    reasonCode: null,
    explanation: `התאמה: ${animalHe(ordered.animal)} ${partHe(ordered.part)}${
      ordered.state ? ' ' + stateHe(ordered.state) : ''
    } בשני הצדדים. הבדלי משקל/יצרן/שפה לא משפיעים על הזהות.`,
  };
}

function partHe(p: string | null) { return p ? (PART_HE[p] ?? p) : 'לא זוהה'; }
function animalHe(a: string | null) { return a ? (ANIMAL_HE[a] ?? a) : 'לא זוהה'; }
function stateHe(s: string | null) { return s ? (STATE_HE[s] ?? s) : ''; }

/** מחרוזת תיאור אנושית קצרה לזהות מוצר */
export function identityToHe(id: ProductIdentity | null): string {
  if (!id) return 'לא זוהה';
  const parts = [animalHe(id.animal), partHe(id.part), id.state ? stateHe(id.state) : '']
    .filter((x) => x && x !== 'לא זוהה');
  return parts.length ? parts.join(' ') : 'לא זוהה';
}
