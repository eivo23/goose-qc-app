// מונחון תרגום ונרמול. חולץ מהתוויות עצמן (עברית + אנגלית + הונגרית + צרפתית).
// זהו הידע שמאפשר השוואה ישירה בין המדבקה הכחולה לתווית הקרטון, ללא קטלוג מוגדר מראש.

/** מיפוי מונח גולמי (בכל שפה) -> ערך קנוני של חלק המוצר */
export const PART_SYNONYMS: Record<string, string[]> = {
  liver: ['כבד', 'liver', 'foie', 'foie gras', 'máj', 'maj', 'libamáj', 'libamaj'],
  leg: ['שוק', 'שוקיים', 'leg', 'cuisse', 'comb', 'libacomb', 'drumstick'],
  wing: ['כנף', 'כנפיים', 'צלעות', 'צלע', 'wing', 'wings', 'aile', 'ailes', 'szárny', 'szarny', 'szárnytő', 'szarnyto', 'liba szárnytő'],  breast: ['חזה', 'breast', 'poitrine', 'mell', 'libamell'],
  heart: ['לב', 'heart', 'coeur', 'cœur', 'szív', 'sziv'],
  gizzard: ['קורקבן', 'gizzard', 'gésier', 'gesier', 'zúza', 'zuza'],
  fat: ['שומן', 'fat', 'graisse', 'zsír', 'zsir'],
  thigh: ['ירך', 'ירכיים', 'thigh', 'felsőcomb', 'felsocomb'],
  whole: ['שלם', 'אווז שלם', 'whole', 'egész', 'egesz'],
};

/** שם קנוני -> תווית עברית להצגה */
export const PART_HE: Record<string, string> = {
  liver: 'כבד',
  leg: 'שוק',
  wing: 'כנף',
  breast: 'חזה',
  heart: 'לב',
  gizzard: 'קורקבן',
  fat: 'שומן',
  thigh: 'ירך',
  whole: 'שלם',
};

export const ANIMAL_SYNONYMS: Record<string, string[]> = {
  goose: ['אווז', 'אוז', 'goose', 'oie', 'liba'],
  duck: ['ברווז', 'duck', 'canard', 'kacsa'],
  chicken: ['עוף', 'chicken', 'poulet', 'csirke'],
};

export const ANIMAL_HE: Record<string, string> = {
  goose: 'אווז',
  duck: 'ברווז',
  chicken: 'עוף',
};

export const STATE_SYNONYMS: Record<string, string[]> = {
  frozen: ['קפוא', 'frozen', 'congele', 'congelé', 'fagyasztott', 'surgelé'],
  chilled: ['מצונן', 'chilled', 'fresh', 'refrigere', 'réfrigéré', 'hűtött', 'hutott'],
};

export const STATE_HE: Record<string, string> = {
  frozen: 'קפוא',
  chilled: 'מצונן',
};

/** מילים לדילוג בעת נרמול - לא משפיעות על זהות המוצר */
export const NOISE_WORDS = [
  'כשר', 'לפסח', 'כשר לפסח', 'kosher', 'kóser', 'net', 'נטו', 'משקל', 'ואקום', 'vacuum',
  'palmi', 'palmi-top', 'top', 'hu', 'ek', 'ק"ג', 'קג', 'kg', 'produit', 'par',
];

/**
 * מחפש התאמה קנונית עבור טקסט חופשי מול טבלת מילים נרדפות.
 * מחזיר את הערך הקנוני או null. עמיד לשגיאות OCR קלות (התאמת מרחק).
 */
export function canonicalize(
  text: string,
  table: Record<string, string[]>
): string | null {
  const t = normalizeText(text);
  // התאמה מדויקת/הכלה
  for (const [canonical, variants] of Object.entries(table)) {
    for (const v of variants) {
      const nv = normalizeText(v);
      if (!nv) continue;
      if (t === nv || t.includes(nv) || nv.includes(t)) return canonical;
    }
  }
  // התאמה עמידה-לשגיאות (מרחק Levenshtein קטן על מילה בודדת)
  const words = t.split(/\s+/).filter(Boolean);
  for (const [canonical, variants] of Object.entries(table)) {
    for (const v of variants) {
      const nv = normalizeText(v);
      if (nv.length < 3) continue;
      for (const w of words) {
        if (w.length < 3) continue;
        if (levenshtein(w, nv) <= 1) return canonical;
      }
    }
  }
  return null;
}

/** נרמול טקסט: הסרת ניקוד/פיסוק, אחידות רווחים, lowercase */
export function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // ניקוד עברי
    .replace(/["'`.,;:()\[\]{}\/\\|*\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
