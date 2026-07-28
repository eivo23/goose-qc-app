import OpenAI from 'openai';
import { z } from 'zod';
import type { ExtractedLabel } from '../types';
import type { VisionProvider, DetectedCarton, AnalyzeImageInput } from './provider';
import { normalizeIdentity } from '../normalize';
import { log } from '../logger';

const IdentitySchema = z.object({
  animal: z.string().nullable().optional(),
  part: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),   // דרגת משקל כבד: כחולה "600/700" · קרטון "6-7"/"1+"
  sliced: z.boolean().nullable().optional(),  // כבד פרוס (מדבקה כחולה)
  stars: z.number().nullable().optional(),    // מספר כוכביות שנראות על הקרטון (null אם לא ברור)
});

const LabelSchema = z.object({
  rawText: z.string().default(''),
  language: z.string().nullable().optional(),
  translationHe: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  packageSeq: z.string().nullable().optional(),
  identity: IdentitySchema.default({}),
  confidence: z.number().min(0).max(100).default(85), // אם המנוע לא החזית ערך אך קרא תווית - מניחים קריאה סבירה
});

const CartonSchema = z.object({
  blue: LabelSchema.nullable().optional(),
  carton: LabelSchema.nullable().optional(),
  pairingConfidence: z.number().min(0).max(100).default(85), // ברירת מחדל גבוהה: רוב התמונות הן קרטון בודד עם הצמדה ברורה
});

const ResponseSchema = z.object({ cartons: z.array(CartonSchema).default([]) });

const SYSTEM_PROMPT = `אתה מנתח תמונות של קרטוני מוצרי אווז במפעל מזון.
בכל קרטון יש שתי תוויות:
1. "carton" - תווית היצרן המודפסת (עברית + צרפתית + הונגרית) = המוצר שיש בפועל בקרטון.
2. "blue" - מדבקה כחולה בהירה מודפסת מההזמנה = שם הלקוח + המוצר שהוזמן.

זהה כל קרטון בתמונה בנפרד. לכל קרטון החזר את תוויתו הכחולה ותווית היצרן הקרובה אליו.
אם יש כמה קרטונים ואינך בטוח איזו מדבקה כחולה שייכת לאיזה קרטון - החזר pairingConfidence נמוך.

מכל תווית חלץ: rawText (הטקסט הגולמי המלא), language (he/en/hu/fr), translationHe (תרגום לעברית אם זר),
customerName (רק במדבקה הכחולה), packageSeq (למשל "2/3"),
identity: { animal, part, state, weight, sku, barcode, grade, sliced, stars } - במונחים באנגלית קנונית:
  animal: goose/duck/chicken ; part: liver/leg/wing/breast/heart/gizzard/fat/thigh ; state: frozen/chilled.
תרגום הונגרי חשוב: máj=liver, comb=leg, szárnytő/szárny=wing, mell=breast.

חשוב מאוד - שם הלקוח (customerName): מופיע במדבקה הכחולה אחרי המילה "לקוח". קרא את שם העסק המלא והמדויק אות-אות, כולל בע"מ/ובניו/מספרים. אם אינך בטוח בקריאה, החזר confidence נמוך במקום לנחש.

בדיקות ייעודיות לכבד אווז (liver) - חלץ בקפידה, ורק אם באמת ברור. אם לא ברור, החזר null (אל תנחש):
- grade (דרגת משקל): במדבקה הכחולה מופיע טווח כמו "400/600", "600/700", "700/900" או "קילו+"/"1 ק""ג+". על תווית/ריבוע היצרן שעל הקרטון מופיעות ספרות כמו "4-6", "6-7", "7-9" או "1+". החזר את המחרוזת בדיוק כפי שהיא כתובה (למשל "600/700" לכחולה, "6-7" לקרטון).
- sliced (כבד פרוס): במדבקה הכחולה בלבד - true אם כתוב "כבד אווז פרוס"/"פרוס", אחרת false.
- stars (כוכביות): על הקרטון בלבד - מספר סימני הכוכבית (*) שאתה רואה בבירור (למשל 2 עבור "* *"). אם אינך מצליח לראות/לספור בוודאות, החזר null - אל תחזיר 0 בניחוש.

confidence (0-100) לכל תווית: אם קראת את המוצר והטקסט בבירור - החזר ערך גבוה (90-100). החזר ערך נמוך (מתחת ל-60) רק אם התמונה מטושטשת/כהה/חתוכה ובאמת קשה לקרוא. אל תחזיר confidence נמוך סתם כאמצעי זהירות כשקראת בבירור.
pairingConfidence: אם בתמונה קרטון אחד בלבד, או שברור איזו מדבקה כחולה שייכת לאיזה קרטון - החזר ערך גבוה (90-100). ערך נמוך רק כשבאמת יש בלבול בין כמה קרטונים.

מבנה ה-JSON חייב להיות בדיוק כך, עם המפתחות "blue" ו-"carton" (ולא "cartonLabel"/"blueLabel"/שמות אחרים):
{"cartons":[{"blue":{תווית כחולה או null},"carton":{תווית יצרן או null},"pairingConfidence":מספר}]}
כל תווית (blue/carton) מכילה: rawText, language, translationHe, customerName, packageSeq, identity, confidence.
החזר JSON תקין בלבד.`;

export class OpenAIVisionProvider implements VisionProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY חסר. הגדירו אותו ב-.env.local (או במשתני הסביבה ב-Vercel).');
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<DetectedCarton[]> {
    // ניסיון חוזר: מודלי Vision מחזירים לעיתים JSON ריק/חלקי גם על תמונה ברורה.
    // מנסים עד 3 פעמים, ומחזירים "לא קריא" רק אם כל הניסיונות נכשלו.
    let lastContent = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'נתח את התמונה והחזר JSON עם שדה "cartons". חובה להחזיר לפחות קרטון אחד עם התוויות שקראת בפועל מהתמונה.' },
                {
                  type: 'image_url',
                  image_url: { url: `data:${input.mime};base64,${input.base64}`, detail: 'high' },
                },
              ],
            },
          ],
        });

        lastContent = res.choices[0]?.message?.content || '{}';
        const raw: any = JSON.parse(lastContent);
        // המנוע לעיתים משנה את שמות המפתחות (למשל "cartonLabel" במקום "carton").
        // מקבלים את כל השמות הנפוצים כדי לא לאבד קריאה תקינה.
        const rawCartons: any[] = Array.isArray(raw?.cartons)
          ? raw.cartons
          : Array.isArray(raw?.results)
          ? raw.results
          : raw && (raw.blue || raw.carton || raw.cartonLabel || raw.blueLabel)
          ? [raw]
          : [];
        const cartons = rawCartons.map((c: any) => ({
          pairingConfidence: typeof c?.pairingConfidence === 'number' ? c.pairingConfidence : 85,
          blue: toLabel('blue', c?.blue ?? c?.blueLabel ?? c?.blueSticker ?? c?.orderLabel ?? c?.order ?? c?.orderSticker),
          carton: toLabel('carton', c?.carton ?? c?.cartonLabel ?? c?.manufacturerLabel ?? c?.manufacturer ?? c?.productLabel ?? c?.label),
        }));
        // הצלחה: לפחות תווית אחת נקראה. אחרת - ננסה שוב.
        if (cartons.some((c) => c.blue || c.carton)) return cartons;
        log.error('openai returned empty result', { attempt, model: this.model, sample: lastContent.slice(0, 400) });
      } catch (err: any) {
        log.error('openai.analyzeImage failed', { attempt, error: err?.message, sample: lastContent.slice(0, 400) });
      }
    }
    // כל הניסיונות נכשלו -> קרטון לא-קריא (גישה שמרנית, לא מנחשים)
    return [{ blue: null, carton: null, pairingConfidence: 0 }];
  }
}

function toLabel(kind: 'blue' | 'carton', raw: any): ExtractedLabel | null {
  if (!raw) return null;
  const l = LabelSchema.parse(raw);
  return {
    kind,
    rawText: l.rawText,
    language: l.language ?? null,
    translationHe: l.translationHe ?? null,
    customerName: l.customerName ?? null,
    packageSeq: l.packageSeq ?? null,
    identity: normalizeIdentity((l.translationHe || l.rawText) + ' ' + l.rawText, l.identity as any),
    confidence: l.confidence,
  };
}
