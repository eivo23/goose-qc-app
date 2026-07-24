// קודי סיבה לחריגות + תיאור בעברית להצגה.
export const REASONS: Record<string, string> = {
  product_mismatch: 'המוצר שעל המדבקה הכחולה אינו תואם למוצר שעל הקרטון',
  uncertain_product: 'לא ניתן לזהות בוודאות את המוצר',
  low_confidence: 'רמת הביטחון נמוכה מהסף שהוגדר',
  blue_unreadable: 'לא ניתן לקרוא את המדבקה הכחולה',
  carton_unreadable: 'לא ניתן לקרוא את תווית הקרטון',
  multiple_customers: 'זוהו מדבקות של יותר מלקוח אחד',
  pairing_uncertain: 'מספר קרטונים בתמונה ולא ניתן לדעת איזו מדבקה שייכת לאיזה קרטון',
  barcode_mismatch: 'ברקוד או מק"ט שזוהו אינם תואמים',
  sequence_gap: 'רצף החבילות אינו הגיוני (חסרה חבילה ברצף)',
  duplicate_image: 'אותה תמונה הועלתה פעמיים',
  blurry_image: 'התמונה מטושטשת, כהה, חתוכה או מוסתרת',
};

export function reasonText(code: string | null): string {
  if (!code) return '';
  return REASONS[code] ?? code;
}

// טקסטים לסטטוסים (משותפים לבדיקות ולחריגות)
export const STATUS_HE: Record<string, string> = {
  new: 'חדשה',
  seen: 'נצפתה',
  in_progress: 'בטיפול',
  confirmed_error: 'אושרה כטעות',
  dismissed: 'בוטלה',
  reshoot: 'נשלחה לצילום מחדש',
  closed: 'נסגרה',
};

export const RESULT_HE: Record<string, string> = {
  pending: 'ממתין לבדיקה',
  ok: 'תקין',
  review: 'לבדיקת מנהל',
  exception: 'חריגה',
  unreadable: 'לא ניתן לקרוא',
};
