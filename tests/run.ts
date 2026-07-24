// מריץ בדיקות בסיס ללא תלות חיצונית (fallback כשאין vitest).
// שימוש: node --experimental-strip-types --import ./scripts/register-loader.mjs tests/run.ts
import { normalizeIdentity, isIdentified } from '../src/lib/normalize.ts';
import { compareIdentities } from '../src/lib/compare.ts';
import { analyzeCheck, findSequenceGap } from '../src/lib/analyze.ts';
import type { DetectedCarton } from '../src/lib/vision/provider.ts';
import type { ExtractedLabel } from '../src/lib/types.ts';

// בונה פלט שכבת ה-Vision (כפי ש-OpenAI מחזיר) כ-fixture לבדיקה
function lbl(kind: 'blue' | 'carton', raw: string, customer?: string, seq?: string): ExtractedLabel {
  return {
    kind, rawText: raw, language: 'he', translationHe: null,
    customerName: customer ?? null, packageSeq: seq ?? null,
    identity: normalizeIdentity(raw), confidence: 95, bbox: null,
  };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}

console.log('נרמול רב-לשוני:');
check('כבד אווז קפוא -> goose/liver/frozen', (() => {
  const id = normalizeIdentity('כבד אווז קפוא');
  return id.animal === 'goose' && id.part === 'liver' && id.state === 'frozen';
})());
check('LIBACOMB -> leg', normalizeIdentity("LIBACOMB CUISSE D'OIE CONGELE").part === 'leg');
check('SZÁRNYTŐ -> wing', normalizeIdentity('LIBA SZÁRNYTŐ AILES').part === 'wing');
check('שגיאת OCR קלה עדיין מזוהה', normalizeIdentity('כבד אווז קפוה').part === 'liver');

console.log('השוואה:');
check('כבד מול שוק = mismatch',
  compareIdentities(normalizeIdentity('כבד אווז קפוא'), normalizeIdentity('שוק אווז קפוא'), 95).matchResult === 'mismatch');
check('אותו מוצר בשפות שונות = match',
  compareIdentities(normalizeIdentity('כבד אווז קפוא'), normalizeIdentity('LIBAMÁJ FOIE GRAS CONGELE'), 95).matchResult === 'match');
check('מילים משותפות בלבד לא מספיקות',
  compareIdentities(normalizeIdentity('כבד אווז קפוא כשר 12 קג'), normalizeIdentity('כנף אווז קפוא כשר 12 קג'), 95).matchResult === 'mismatch');
check('חוסר זיהוי לעולם לא תקין',
  !isIdentified(normalizeIdentity('טקסט לא ברור')) &&
  compareIdentities(normalizeIdentity('טקסט לא ברור'), normalizeIdentity('שוק אווז קפוא'), 95).matchResult === 'uncertain');
check('הבדל משקל לא משפיע',
  compareIdentities(normalizeIdentity('שוק אווז קפוא 10 קג'), normalizeIdentity('שוק אווז קפוא 12 קג'), 95).matchResult === 'match');

console.log('רצף חבילות:');
check('1/3 ו-3/3 בלי 2/3 = פער', (findSequenceGap(new Set(['1/3', '3/3'])) || '').includes('2/3'));
check('רצף שלם = תקין', findSequenceGap(new Set(['1/3', '2/3', '3/3'])) === null);

console.log('ניתוח מלא (זרימת המנוע מקצה לקצה):');
// תרחיש חריגה: הוזמן כבד, בקרטון שוק (קיבוץ אילות)
const d1: DetectedCarton[][] = [[{
  pairingConfidence: 92,
  blue: lbl('blue', 'קיבוץ אילות כבד אווז קפוא', 'קיבוץ אילות', '1/2'),
  carton: lbl('carton', "שוק אווז קפוא LIBACOMB CUISSE D'OIE CONGELE"),
}]];
const r1 = analyzeCheck(d1);
check('חריגה => exception', r1.overallResult === 'exception');
check('חריגה => לקוח קיבוץ אילות', (r1.customerName || '').includes('קיבוץ אילות'));
check('חריגה => mismatch (כבד/שוק)', r1.cartons[0].matchResult === 'mismatch');

// תרחיש תקין: כנפיים מול כנפיים (מיטטוגו), רצף 1/3-2/3-3/3
const mk = (seq: string): DetectedCarton => ({
  pairingConfidence: 95,
  blue: lbl('blue', 'מיטטוגו כנפיים אווז קפוא', 'מיטטוגו', seq),
  carton: lbl('carton', 'כנפיים אווז קפוא LIBA SZÁRNYTŐ'),
});
const r2 = analyzeCheck([[mk('1/3'), mk('2/3'), mk('3/3')]]);
check('תקין => ok', r2.overallResult === 'ok');
check('תקין => לקוח מיטטוגו', (r2.customerName || '').includes('מיטטוגו'));
check('תקין => ללא חריגות', r2.exceptions.length === 0);

console.log(`\nסה"כ: ${pass} עברו, ${fail} נכשלו`);
if (fail > 0) process.exit(1);
