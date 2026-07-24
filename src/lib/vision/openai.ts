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
});

const LabelSchema = z.object({
  rawText: z.string().default(''),
  language: z.string().nullable().optional(),
  translationHe: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  packageSeq: z.string().nullable().optional(),
  identity: IdentitySchema.default({}),
  confidence: z.number().min(0).max(100).default(0),
});

const CartonSchema = z.object({
  blue: LabelSchema.nullable().optional(),
  carton: LabelSchema.nullable().optional(),
  pairingConfidence: z.number().min(0).max(100).default(0),
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
identity: { animal, part, state, weight, sku, barcode } - במונחים באנגלית קנונית:
  animal: goose/duck/chicken ; part: liver/leg/wing/breast/heart/gizzard/fat/thigh ; state: frozen/chilled.
תרגום הונגרי חשוב: máj=liver, comb=leg, szárnytő/szárny=wing, mell=breast.
confidence: 0-100 עד כמה אתה בטוח בקריאה. אל תנחש - אם לא ברור, החזר confidence נמוך.
החזר JSON תקין בלבד לפי הסכימה.`;

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
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'נתח את התמונה והחזר JSON עם שדה "cartons".' },
              {
                type: 'image_url',
                image_url: { url: `data:${input.mime};base64,${input.base64}`, detail: 'high' },
              },
            ],
          },
        ],
      });

      const content = res.choices[0]?.message?.content || '{}';
      const parsed = ResponseSchema.parse(JSON.parse(content));
      return parsed.cartons.map((c) => ({
        pairingConfidence: c.pairingConfidence,
        blue: toLabel('blue', c.blue),
        carton: toLabel('carton', c.carton),
      }));
    } catch (err: any) {
      log.error('openai.analyzeImage failed', { error: err?.message });
      // כשל בזיהוי -> קרטון לא-קריא (גישה שמרנית, לא מנחשים)
      return [{ blue: null, carton: null, pairingConfidence: 0 }];
    }
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
