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
  let mismatch = false;      // אי-התאמת זהות בסיסית (בעל חיים/חלק/מצב)
  let gradeMismatch = false; // דרגת משקל כבד שונה
  let starsMismatch = false; // כבד פרוס אך אין 2 כוכביות
  let liverReviewCode: string | null = null; // דרגה/כוכביות לא קריאות -> בדיקת מנהל

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

  // 4b. בדיקות ייעודיות לכבד אווז (מקרא): דרגת משקל + כבד פרוס = 2 כוכביות.
  // עיקרון: הבדיקות האלה *מוסיפות* חריגה רק כשיש סתירה ברורה. הן לעולם אינן
  // הופכות התאמת-מוצר תקינה ל"לא ניתן לקרוא" - אם לא ניתן לקרוא את הריבוע/הכוכביות,
  // פשוט לא בודקים אותם (כדי לא להציף בהתראות שווא).
  if (ordered.part === 'liver' && found.part === 'liver') {
    // דרגת משקל: רק אם *שני* הצדדים נקראו בבירור ושונים -> אי-התאמה.
    if (ordered.grade && found.grade && ordered.grade !== found.grade) {
      gradeMismatch = true;
      reasons.push(`דרגת משקל שונה: הוזמן ${ordered.grade}, בקרטון ${found.grade}`);
    }

    // כבד פרוס: רק אם ההזמנה פרוסה והקרטון מראה בבירור פחות מ-2 כוכביות -> שגיאה.
    // אם לא ניתן לספור בוודאות (stars = null) - לא חוסמים.
    if (ordered.sliced === true && found.stars != null && found.stars < 2) {
      starsMismatch = true;
      reasons.push('הוזמן כבד פרוס אך על הקרטון אין 2 כוכביות (סימון "פרוס")');
    }
  }

  const anyMismatch = mismatch || gradeMismatch || starsMismatch;

  // הערה: אין השוואת ברקוד/מק"ט. מספר ההזמנה (מדבקה כחולה) שונה במכוון ממספר
  // היצרן (קרטון), ולכן השוואה כזו יוצרת חריגות שווא. משווים לפי מוצר בלבד.

  if (anyMismatch) {
    // קוד סיבה: זהות בסיסית שונה גוברת; אחרת דרגת משקל; אחרת כוכביות.
    const reasonCode = mismatch
      ? 'product_mismatch'
      : gradeMismatch
      ? 'grade_mismatch'
      : 'missing_stars';
    return {
      matchResult: 'mismatch',
      confidence: Math.max(baseConfidence, 90), // בטוחים באי-התאמה כשהנתונים ברורים
      reasonCode,
      explanation: reasons.join(' · '),
    };
  }

  // דרגת משקל/כוכביות לא נקראו בוודאות אף שהזהות תואמת -> בדיקת מנהל (שמרני).
  if (liverReviewCode) {
    return {
      matchResult: 'uncertain',
      confidence: Math.min(baseConfidence, 70),
      reasonCode: liverReviewCode,
      explanation:
        liverReviewCode === 'grade_unreadable'
          ? 'הזהות תואמת אך לא ניתן לקרוא בוודאות את דרגת המשקל (הריבוע) על הקרטון - נדרשת בדיקת מנהל.'
          : 'הוזמן כבד פרוס אך לא ניתן לספור בוודאות את הכוכביות על הקרטון - נדרשת בדיקת מנהל.',
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
