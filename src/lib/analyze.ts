import type {
  CartonAnalysis,
  CheckAnalysis,
  OverallResult,
  Thresholds,
} from './types';
import type { DetectedCarton } from './vision/provider';
import { compareIdentities, identityToHe } from './compare';
import { isIdentified } from './normalize';

export const DEFAULT_THRESHOLDS: Thresholds = {
  ok: Number(process.env.CONFIDENCE_OK ?? 90),
  review: Number(process.env.CONFIDENCE_REVIEW ?? 75),
};

/**
 * מקבל את כל הקרטונים שזוהו בכל תמונות הבדיקה (לקוח אחד) ומפיק ניתוח מלא:
 * נרמול, השוואה, ביטחון, סטטוס, וכל החריגות ברמת הבדיקה.
 * הגישה שמרנית: כל ספק -> חריגה, לעולם לא מנחשים "תקין".
 */
export function analyzeCheck(
  detectionsPerImage: DetectedCarton[][],
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): CheckAnalysis {
  const cartons: CartonAnalysis[] = [];
  const exceptions: CheckAnalysis['exceptions'] = [];
  const customers = new Set<string>();
  const seqByCustomer: Record<string, Set<string>> = {};

  detectionsPerImage.forEach((detections, imageIndex) => {
    if (!detections.length || detections.every((d) => !d.blue && !d.carton)) {
      exceptions.push({ reasonCode: 'blurry_image', cartonIndex: imageIndex, detail: 'לא זוהו תוויות בתמונה' });
      cartons.push(makeUnreadable(imageIndex));
      return;
    }

    for (const det of detections) {
      const a = analyzeCarton(det, imageIndex, thresholds, exceptions);
      cartons.push(a);
      if (a.detectedCustomer) {
        customers.add(a.detectedCustomer.trim());
        const c = a.detectedCustomer.trim();
        seqByCustomer[c] = seqByCustomer[c] || new Set();
        if (a.packageSeq) seqByCustomer[c].add(a.packageSeq);
      }
    }
  });

  // חריגה: יותר מלקוח אחד באותה בדיקה
  if (customers.size > 1) {
    exceptions.push({
      reasonCode: 'multiple_customers',
      cartonIndex: null,
      detail: `זוהו הלקוחות: ${Array.from(customers).join(', ')}`,
    });
  }

  // חריגה: רצף חבילות לא הגיוני (למשל 1/3 ו-3/3 בלי 2/3)
  for (const [cust, seqs] of Object.entries(seqByCustomer)) {
    const gap = findSequenceGap(seqs);
    if (gap) {
      exceptions.push({
        reasonCode: 'sequence_gap',
        cartonIndex: null,
        detail: `לקוח ${cust}: ${gap}`,
      });
    }
  }

  const customerName = customers.size === 1 ? Array.from(customers)[0] : (Array.from(customers)[0] ?? null);
  const overall = deriveOverall(cartons, exceptions);
  const confidence = cartons.length
    ? Math.round(cartons.reduce((s, c) => s + c.confidence, 0) / cartons.length)
    : 0;

  return { customerName, overallResult: overall, confidence, cartons, exceptions };
}

function analyzeCarton(
  det: DetectedCarton,
  imageIndex: number,
  thresholds: Thresholds,
  exceptions: CheckAnalysis['exceptions']
): CartonAnalysis {
  const blue = det.blue;
  const carton = det.carton;

  // תוויות חסרות/לא-קריאות
  if (!blue && !carton) {
    exceptions.push({ reasonCode: 'blurry_image', cartonIndex: imageIndex, detail: 'לא ניתן לקרוא את הקרטון' });
    return makeUnreadable(imageIndex);
  }
  if (!blue) exceptions.push({ reasonCode: 'blue_unreadable', cartonIndex: imageIndex, detail: 'המדבקה הכחולה לא נקראה' });
  if (!carton) exceptions.push({ reasonCode: 'carton_unreadable', cartonIndex: imageIndex, detail: 'תווית הקרטון לא נקראה' });

  // הצמדה לא ודאית בין מדבקה לקרטון
  if (blue && carton && det.pairingConfidence < 60) {
    exceptions.push({ reasonCode: 'pairing_uncertain', cartonIndex: imageIndex, detail: 'הצמדת מדבקה-קרטון לא ודאית' });
  }

  const orderedId = blue?.identity ?? null;
  const foundId = carton?.identity ?? null;

  const baseConf = Math.min(
    blue?.confidence ?? 100,
    carton?.confidence ?? 100,
    blue && carton ? det.pairingConfidence : 100
  );

  let cmp;
  if (!orderedId || !foundId) {
    cmp = {
      matchResult: 'uncertain' as const,
      confidence: Math.min(baseConf, 40),
      reasonCode: !blue ? 'blue_unreadable' : 'carton_unreadable',
      explanation: 'חסרה אחת התוויות - לא ניתן להשוות.',
    };
  } else {
    cmp = compareIdentities(orderedId, foundId, baseConf);
  }

  // סף ביטחון: התאמה בביטחון נמוך אינה מספיקה
  let reasonCode = cmp.reasonCode;
  if (cmp.matchResult === 'match' && cmp.confidence < thresholds.review) {
    reasonCode = 'low_confidence';
    exceptions.push({ reasonCode, cartonIndex: imageIndex, detail: `ביטחון ${cmp.confidence} מתחת לסף` });
  } else if (cmp.matchResult === 'mismatch') {
    exceptions.push({ reasonCode: cmp.reasonCode || 'product_mismatch', cartonIndex: imageIndex, detail: cmp.explanation });
  } else if (cmp.matchResult === 'uncertain') {
    exceptions.push({ reasonCode: reasonCode || 'uncertain_product', cartonIndex: imageIndex, detail: cmp.explanation });
  }

  return {
    imageIndex,
    detectedCustomer: blue?.customerName ?? null,
    packageSeq: blue?.packageSeq ?? carton?.packageSeq ?? null,
    blueRaw: blue?.rawText ?? null,
    cartonRaw: carton?.rawText ?? null,
    blueTranslation: blue?.translationHe ?? null,
    cartonTranslation: carton?.translationHe ?? null,
    blueNormalized: orderedId,
    cartonNormalized: foundId,
    matchResult: cmp.matchResult,
    confidence: cmp.confidence,
    mismatchReason: reasonCode,
    explanation:
      cmp.explanation +
      (orderedId && foundId
        ? `  [הוזמן: ${identityToHe(orderedId)} · נמצא: ${identityToHe(foundId)}]`
        : ''),
  };
}

function makeUnreadable(imageIndex: number): CartonAnalysis {
  return {
    imageIndex,
    detectedCustomer: null,
    packageSeq: null,
    blueRaw: null,
    cartonRaw: null,
    blueTranslation: null,
    cartonTranslation: null,
    blueNormalized: null,
    cartonNormalized: null,
    matchResult: 'uncertain',
    confidence: 0,
    mismatchReason: 'blurry_image',
    explanation: 'לא ניתן לקרוא את התמונה - יש לצלם מחדש.',
  };
}

function deriveOverall(cartons: CartonAnalysis[], exceptions: CheckAnalysis['exceptions']): OverallResult {
  if (!cartons.length) return 'unreadable';
  const hasMismatch = cartons.some((c) => c.matchResult === 'mismatch') ||
    exceptions.some((e) => ['product_mismatch', 'grade_mismatch', 'missing_stars', 'multiple_customers', 'sequence_gap', 'barcode_mismatch', 'duplicate_image'].includes(e.reasonCode));
  const allUnreadable = cartons.every((c) => c.confidence === 0);
  const hasUncertain = cartons.some((c) => c.matchResult === 'uncertain');

  if (hasMismatch) return 'exception';
  if (allUnreadable) return 'unreadable';
  if (hasUncertain) return 'review';
  return 'ok';
}

/** מחזיר תיאור חוסר ברצף חבילות, או null אם הרצף תקין/לא ניתן להסקה */
export function findSequenceGap(seqs: Set<string>): string | null {
  const parsed = Array.from(seqs)
    .map((s) => s.match(/^(\d+)\s*\/\s*(\d+)$/))
    .filter(Boolean)
    .map((m) => ({ n: Number(m![1]), total: Number(m![2]) }));
  if (parsed.length < 2) return null;
  const total = parsed[0].total;
  if (!parsed.every((p) => p.total === total)) return `מספרי סה"כ שונים ברצף`;
  const present = new Set(parsed.map((p) => p.n));
  const missing: number[] = [];
  const maxSeen = Math.max(...parsed.map((p) => p.n));
  for (let i = 1; i <= maxSeen; i++) if (!present.has(i)) missing.push(i);
  if (missing.length) return `חסרות חבילות ${missing.map((m) => `${m}/${total}`).join(', ')}`;
  return null;
}
