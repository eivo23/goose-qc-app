// טיפוסי הליבה של המערכת

/** זהות מוצר מנורמלת - התוצר החשוב ביותר בכל תווית */
export interface ProductIdentity {
  animal: string | null;   // canonical: 'goose'
  part: string | null;     // canonical: 'liver' | 'leg' | 'wing' | 'breast' | 'heart' | 'gizzard' | 'fat' | 'thigh'
  state: string | null;    // canonical: 'frozen' | 'chilled'
  weight: string | null;   // כפי שנקרא, לא משפיע על ההשוואה
  sku: string | null;
  barcode: string | null;
}

/** תווית בודדת כפי שחולצה על ידי מנוע ה-Vision */
export interface ExtractedLabel {
  kind: 'blue' | 'carton';       // מדבקה כחולה (הזמנה) או תווית יצרן (מה שיש בקרטון)
  rawText: string;               // טקסט גולמי מלא של ה-OCR
  language: string | null;       // 'he' | 'en' | 'hu' | ...
  translationHe: string | null;  // תרגום לעברית כשהתווית זרה
  customerName: string | null;   // רק במדבקה הכחולה
  packageSeq: string | null;     // למשל '2/3'
  identity: ProductIdentity;     // חילוץ ראשוני של המנוע (מנורמל שוב בצד השרת)
  confidence: number;            // 0-100 ביטחון המנוע בקריאה
  bbox?: [number, number, number, number] | null; // אזור בתמונה (x,y,w,h) יחסי 0-1
}

/** קרטון = זוג של מדבקה כחולה + תווית יצרן שהוצמדו */
export interface CartonPair {
  imageIndex: number;
  blue: ExtractedLabel | null;
  carton: ExtractedLabel | null;
  pairingConfidence: number;     // כמה בטוחים שהצמדנו נכון
}

export type MatchResult = 'match' | 'mismatch' | 'uncertain';
export type OverallResult = 'pending' | 'ok' | 'review' | 'exception' | 'unreadable';

/** תוצאת ניתוח של קרטון בודד */
export interface CartonAnalysis {
  imageIndex: number;
  detectedCustomer: string | null;
  packageSeq: string | null;
  blueRaw: string | null;
  cartonRaw: string | null;
  blueTranslation: string | null;
  cartonTranslation: string | null;
  blueNormalized: ProductIdentity | null;
  cartonNormalized: ProductIdentity | null;
  matchResult: MatchResult;
  confidence: number;
  mismatchReason: string | null;   // reason code
  explanation: string;             // הסבר קריא בעברית
}

/** תוצאת ניתוח של בדיקה שלמה (לקוח אחד, מספר תמונות) */
export interface CheckAnalysis {
  customerName: string | null;
  overallResult: OverallResult;
  confidence: number;
  cartons: CartonAnalysis[];
  exceptions: { reasonCode: string; cartonIndex: number | null; detail: string }[];
}

export interface Thresholds {
  ok: number;      // >= ok  => התאמה ודאית
  review: number;  // >= review => לבדיקת מנהל, אחרת חריגה אוטומטית
}
