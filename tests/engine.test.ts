import { describe, it, expect } from 'vitest';
import { normalizeIdentity, isIdentified } from '../src/lib/normalize';
import { compareIdentities } from '../src/lib/compare';
import { analyzeCheck, findSequenceGap } from '../src/lib/analyze';
import type { DetectedCarton } from '../src/lib/vision/provider';
import type { ExtractedLabel } from '../src/lib/types';

function lbl(kind: 'blue' | 'carton', raw: string, customer?: string, seq?: string): ExtractedLabel {
  return {
    kind, rawText: raw, language: 'he', translationHe: null,
    customerName: customer ?? null, packageSeq: seq ?? null,
    identity: normalizeIdentity(raw), confidence: 95, bbox: null,
  };
}

describe('normalizeIdentity - רב לשוני', () => {
  it('עברית: כבד אווז קפוא', () => {
    const id = normalizeIdentity('כבד אווז קפוא');
    expect(id).toMatchObject({ animal: 'goose', part: 'liver', state: 'frozen' });
  });
  it('הונגרית: LIBACOMB = שוק', () => {
    const id = normalizeIdentity("FAGYASZTOTT KÓSER LIBACOMB CUISSE D'OIE CONGELE");
    expect(id.animal).toBe('goose');
    expect(id.part).toBe('leg');
    expect(id.state).toBe('frozen');
  });
  it('הונגרית: SZÁRNYTŐ = כנף', () => {
    const id = normalizeIdentity('LIBA SZÁRNYTŐ AILES D\'OIE CONGELE');
    expect(id.part).toBe('wing');
  });
  it('שגיאת OCR קלה עדיין מזוהה', () => {
    const id = normalizeIdentity('כבד אווז קפוא'.replace('קפוא', 'קפוה'));
    expect(id.part).toBe('liver');
  });
});

describe('compareIdentities - עקרון הליבה', () => {
  it('כבד מול שוק = אי-התאמה', () => {
    const ordered = normalizeIdentity('כבד אווז קפוא');
    const found = normalizeIdentity('שוק אווז קפוא');
    const r = compareIdentities(ordered, found, 95);
    expect(r.matchResult).toBe('mismatch');
    expect(r.reasonCode).toBe('product_mismatch');
  });
  it('אותו מוצר בשפות שונות = התאמה', () => {
    const ordered = normalizeIdentity('כבד אווז קפוא');
    const found = normalizeIdentity('LIBAMÁJ FOIE GRAS CONGELE'); // הונגרית/צרפתית לכבד
    const r = compareIdentities(ordered, found, 95);
    expect(r.matchResult).toBe('match');
  });
  it('מילים משותפות בלבד (אווז/קפוא) לא מספיקות להתאמה', () => {
    const ordered = normalizeIdentity('כבד אווז קפוא 12 קג כשר');
    const found = normalizeIdentity('כנף אווז קפוא 12 קג כשר');
    const r = compareIdentities(ordered, found, 95);
    expect(r.matchResult).toBe('mismatch');
  });
  it('חוסר זיהוי לעולם לא תקין', () => {
    const ordered = normalizeIdentity('טקסט לא ברור');
    const found = normalizeIdentity('שוק אווז קפוא');
    const r = compareIdentities(ordered, found, 95);
    expect(r.matchResult).toBe('uncertain');
    expect(isIdentified(ordered)).toBe(false);
  });
  it('הבדל משקל לא משפיע כשהזהות זהה', () => {
    const ordered = normalizeIdentity('שוק אווז קפוא 10 קג');
    const found = normalizeIdentity('שוק אווז קפוא 12 קג');
    const r = compareIdentities(ordered, found, 95);
    expect(r.matchResult).toBe('match');
  });
});

describe('findSequenceGap', () => {
  it('1/3 ו-3/3 בלי 2/3 = פער', () => {
    expect(findSequenceGap(new Set(['1/3', '3/3']))).toContain('2/3');
  });
  it('רצף שלם = תקין', () => {
    expect(findSequenceGap(new Set(['1/3', '2/3', '3/3']))).toBeNull();
  });
});

describe('analyzeCheck - זרימת המנוע מקצה לקצה', () => {
  it('הוזמן כבד ובקרטון שוק => חריגה', () => {
    const dets: DetectedCarton[] = [{
      pairingConfidence: 92,
      blue: lbl('blue', 'קיבוץ אילות כבד אווז קפוא', 'קיבוץ אילות', '1/2'),
      carton: lbl('carton', "שוק אווז קפוא LIBACOMB CUISSE D'OIE CONGELE"),
    }];
    const res = analyzeCheck([dets]);
    expect(res.overallResult).toBe('exception');
    expect(res.customerName).toContain('קיבוץ אילות');
    expect(res.cartons[0].matchResult).toBe('mismatch');
    expect(res.exceptions.some((e) => e.reasonCode === 'product_mismatch')).toBe(true);
  });

  it('כנפיים מול כנפיים, רצף שלם => תקין', () => {
    const mk = (seq: string): DetectedCarton => ({
      pairingConfidence: 95,
      blue: lbl('blue', 'מיטטוגו כנפיים אווז קפוא', 'מיטטוגו', seq),
      carton: lbl('carton', 'כנפיים אווז קפוא LIBA SZÁRNYTŐ'),
    });
    const res = analyzeCheck([[mk('1/3'), mk('2/3'), mk('3/3')]]);
    expect(res.overallResult).toBe('ok');
    expect(res.customerName).toContain('מיטטוגו');
    expect(res.cartons.every((c) => c.matchResult === 'match')).toBe(true);
    expect(res.exceptions.length).toBe(0);
  });
});
