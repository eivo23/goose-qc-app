import { supabaseAdmin } from './supabase/admin';
import { getVisionProvider } from './vision/provider';
import type { DetectedCarton } from './vision/provider';
import { analyzeCheck, DEFAULT_THRESHOLDS } from './analyze';
import { uploadCartonImage, signedUrl } from './storage';
import { notifyManagers } from './push';
import { identityToHe } from './compare';
import { reasonText } from './reasons';
import { log } from './logger';
import type { Session } from './auth';
import type { CheckAnalysis, Thresholds } from './types';

export interface IncomingImage {
  buffer: Buffer;
  mime: string;
}

export interface PickerResult {
  checkId: string;
  overallResult: string;
  message: string; // הודעה למלקט
  customerName: string | null;
}

async function getThresholds(): Promise<Thresholds> {
  try {
    const { data } = await supabaseAdmin().from('settings').select('*').eq('id', 1).single();
    if (data) return { ok: data.threshold_ok, review: data.threshold_review };
  } catch { /* ברירת מחדל */ }
  return DEFAULT_THRESHOLDS;
}

/** התהליך המרכזי: העלאת תמונות -> זיהוי -> נרמול -> השוואה -> שמירה -> התראה. */
export async function processCheck(
  session: Session,
  images: IncomingImage[],
  dedupeKey?: string
): Promise<PickerResult> {
  const db = supabaseAdmin();

  // מניעת שליחה כפולה
  if (dedupeKey) {
    const { data: existing } = await db.from('checks').select('id, overall_result, customer_name')
      .eq('client_dedupe_key', dedupeKey).maybeSingle();
    if (existing) {
      return {
        checkId: existing.id,
        overallResult: existing.overall_result,
        message: 'הבדיקה כבר נשלחה קודם.',
        customerName: existing.customer_name,
      };
    }
  }

  // 1. יצירת בדיקה
  const { data: check, error: cErr } = await db.from('checks').insert({
    picker_id: session.uid,
    picker_name: session.name,
    images_count: images.length,
    overall_result: 'pending',
    status: 'new',
    client_dedupe_key: dedupeKey ?? null,
  }).select().single();
  if (cErr || !check) throw new Error('כשל ביצירת בדיקה: ' + cErr?.message);

  // 2. העלאת תמונות + זיהוי כפילויות
  const imageIds: string[] = [];
  const hashes: string[] = [];
  const base64s: { base64: string; mime: string }[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const stored = await uploadCartonImage(check.id, i, img.buffer, img.mime);
    const { data: row } = await db.from('images').insert({
      check_id: check.id, storage_path: stored.path, sha256_hash: stored.hash, seq_index: i,
    }).select().single();
    imageIds.push(row?.id);
    hashes.push(stored.hash);
    base64s.push({ base64: img.buffer.toString('base64'), mime: img.mime });
  }

  // 3. זיהוי Vision לכל תמונה
  const provider = await getVisionProvider();
  const detectionsPerImage: DetectedCarton[][] = [];
  for (const b of base64s) {
    try {
      detectionsPerImage.push(await provider.analyzeImage(b));
    } catch (err: any) {
      log.error('vision failed for image', { error: err?.message });
      detectionsPerImage.push([{ blue: null, carton: null, pairingConfidence: 0 }]);
    }
  }

  // 4. ניתוח מלא
  const thresholds = await getThresholds();
  const analysis: CheckAnalysis = analyzeCheck(detectionsPerImage, thresholds);

  // 5. כפילות תמונות
  const dupIdx = firstDuplicateIndex(hashes);
  if (dupIdx >= 0) {
    analysis.exceptions.push({ reasonCode: 'duplicate_image', cartonIndex: dupIdx, detail: 'תמונה זהה הועלתה פעמיים' });
    if (analysis.overallResult === 'ok') analysis.overallResult = 'exception';
  }

  // 6. שמירת ניתוחי קרטון
  for (const c of analysis.cartons) {
    await db.from('carton_analyses').insert({
      check_id: check.id,
      image_id: imageIds[c.imageIndex] ?? null,
      blue_ocr_raw: c.blueRaw,
      carton_ocr_raw: c.cartonRaw,
      blue_translation: c.blueTranslation,
      carton_translation: c.cartonTranslation,
      blue_normalized: c.blueNormalized,
      carton_normalized: c.cartonNormalized,
      detected_customer: c.detectedCustomer,
      package_seq: c.packageSeq,
      match_result: c.matchResult,
      confidence: c.confidence,
      mismatch_reason: c.mismatchReason,
      ai_original_result: c, // תוצאת המערכת המקורית - לא תידרס
    });
  }

  // 7. עדכון הבדיקה
  await db.from('checks').update({
    customer_name: analysis.customerName,
    overall_result: analysis.overallResult,
    confidence: analysis.confidence,
  }).eq('id', check.id);

  // 8. שמירת חריגות
  const uniqueReasons = dedupeExceptions(analysis.exceptions);
  for (const ex of uniqueReasons) {
    await db.from('exceptions').insert({
      check_id: check.id, reason_code: ex.reasonCode, status: 'new',
    });
  }

  // 9. יומן
  await audit('check', check.id, 'created', null, { overall: analysis.overallResult }, session.uid);

  // 10. התראת Push על חריגה בביטחון גבוה
  if (analysis.overallResult === 'exception' && analysis.confidence >= thresholds.review) {
    const mismatch = analysis.cartons.find((c) => c.matchResult === 'mismatch');
    const title = 'חריגת ליקוט חדשה';
    const body = mismatch
      ? `לקוח: ${analysis.customerName ?? 'לא ידוע'}. הוזמן: ${identityToHe(mismatch.blueNormalized)}. זוהה בקרטון: ${identityToHe(mismatch.cartonNormalized)}.`
      : `לקוח: ${analysis.customerName ?? 'לא ידוע'}. ${reasonText(uniqueReasons[0]?.reasonCode)}.`;
    notifyManagers({ title, body, url: `/exceptions?check=${check.id}`, tag: `check-${check.id}` }).catch(() => {});
  }

  // 11. הודעה למלקט
  const message =
    analysis.overallResult === 'ok' ? 'הבדיקה תקינה' :
    analysis.overallResult === 'unreadable' ? 'לא ניתן לקרוא את התמונה, יש לצלם מחדש' :
    'הבדיקה הועברה לבדיקת מנהל';

  return { checkId: check.id, overallResult: analysis.overallResult, message, customerName: analysis.customerName };
}

// ==================== שאילתות מנהל ====================

export interface CheckFilters {
  customer?: string; picker?: string; product?: string; date?: string;
  result?: string; status?: string;
}

export async function listChecks(filters: CheckFilters = {}, limit = 100) {
  let q = supabaseAdmin().from('checks').select('*').order('created_at', { ascending: false }).limit(limit);
  if (filters.customer) q = q.ilike('customer_name', `%${filters.customer}%`);
  if (filters.picker) q = q.ilike('picker_name', `%${filters.picker}%`);
  if (filters.result) q = q.eq('overall_result', filters.result);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.date) q = q.gte('created_at', filters.date).lt('created_at', nextDay(filters.date));
  const { data } = await q;
  return data ?? [];
}

export async function getCheckDetail(id: string) {
  const db = supabaseAdmin();
  const { data: check } = await db.from('checks').select('*').eq('id', id).single();
  if (!check) return null;
  const { data: images } = await db.from('images').select('*').eq('check_id', id).order('seq_index');
  const { data: cartons } = await db.from('carton_analyses').select('*').eq('check_id', id);
  const { data: exceptions } = await db.from('exceptions').select('*').eq('check_id', id);
  const { data: actions } = await db.from('manager_actions').select('*').eq('check_id', id).order('created_at');
  // קישורים חתומים קצרי-תוקף
  const withUrls = await Promise.all((images ?? []).map(async (im: any) => ({
    ...im, url: await signedUrl(im.storage_path),
  })));
  return { check, images: withUrls, cartons: cartons ?? [], exceptions: exceptions ?? [], actions: actions ?? [] };
}

export async function listExceptions(filters: { status?: string } = {}) {
  const db = supabaseAdmin();
  let q = db.from('exceptions').select('*').order('opened_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  const { data: exs } = await q;
  const result = await Promise.all((exs ?? []).map(async (ex: any) => {
    const { data: check } = await db.from('checks').select('*').eq('id', ex.check_id).single();
    return { ...ex, check };
  }));
  return result;
}

export async function countNewExceptions(): Promise<number> {
  const { count } = await supabaseAdmin().from('exceptions').select('*', { count: 'exact', head: true }).eq('status', 'new');
  return count ?? 0;
}

const ACTION_TO_STATUS: Record<string, { check?: string; exception?: string }> = {
  verified_ok:      { check: 'closed' },
  confirm_error:    { check: 'confirmed_error', exception: 'confirmed_error' },
  system_wrong:     { check: 'in_progress', exception: 'dismissed' },
  need_reshoot:     { check: 'reshoot', exception: 'reshoot' },
  in_progress:      { check: 'in_progress', exception: 'in_progress' },
  close:            { check: 'closed', exception: 'closed' },
  not_error:        { check: 'dismissed', exception: 'dismissed' },
  seen:             { exception: 'seen' },
};

export async function applyManagerAction(
  session: Session,
  opts: { checkId?: string; exceptionId?: string; action: string; note?: string; correctValue?: any }
) {
  const db = supabaseAdmin();
  const map = ACTION_TO_STATUS[opts.action] ?? {};
  const now = new Date().toISOString();

  if (opts.checkId && map.check) {
    const { data: before } = await db.from('checks').select('status').eq('id', opts.checkId).single();
    const patch: any = { status: map.check };
    if (map.check === 'closed' || map.check === 'confirmed_error') { patch.closed_at = now; patch.closed_by = session.uid; }
    await db.from('checks').update(patch).eq('id', opts.checkId);
    await audit('check', opts.checkId, opts.action, before, patch, session.uid);
  }
  if (opts.exceptionId && map.exception) {
    await db.from('exceptions').update({
      status: map.exception, handled_by: session.uid, handled_at: now,
      ...(map.exception === 'closed' || map.exception === 'confirmed_error' ? { closed_at: now } : {}),
    }).eq('id', opts.exceptionId);
    await audit('exception', opts.exceptionId, opts.action, null, { status: map.exception }, session.uid);
  }

  await db.from('manager_actions').insert({
    check_id: opts.checkId ?? null,
    exception_id: opts.exceptionId ?? null,
    user_id: session.uid,
    action_type: opts.action,
    manager_correct_value: opts.correctValue ?? null,
    note: opts.note ?? null,
  });
}

// ==================== דשבורד ====================
export async function dashboardStats() {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const start = today + 'T00:00:00';
  const { data: todays } = await db.from('checks').select('*').gte('created_at', start);
  const checks = todays ?? [];
  const byResult = (r: string) => checks.filter((c: any) => c.overall_result === r).length;
  const customers = new Set(checks.map((c: any) => c.customer_name).filter(Boolean));
  const images = checks.reduce((s: number, c: any) => s + (c.images_count || 0), 0);
  const newExceptions = await countNewExceptions();
  const { count: confirmedErrors } = await db.from('exceptions').select('*', { count: 'exact', head: true }).eq('status', 'confirmed_error');

  // שיעור טעויות לפי מלקט ולפי מוצר (מכלל הבדיקות)
  const { data: allChecks } = await db.from('checks').select('picker_name, overall_result, customer_name');
  const byPicker = rate(allChecks ?? [], 'picker_name');
  const { data: allCartons } = await db.from('carton_analyses').select('carton_normalized, match_result');
  const productMap: Record<string, { total: number; err: number }> = {};
  for (const c of allCartons ?? []) {
    const name = c.carton_normalized ? identityToHe(c.carton_normalized) : 'לא זוהה';
    productMap[name] = productMap[name] || { total: 0, err: 0 };
    productMap[name].total++;
    if (c.match_result === 'mismatch') productMap[name].err++;
  }
  const byProduct = Object.entries(productMap).map(([k, v]) => ({ key: k, ...v, rate: pct(v.err, v.total) }));

  const recentExceptions = (await listExceptions()).slice(0, 10);

  return {
    checksToday: checks.length,
    customersToday: customers.size,
    imagesToday: images,
    okToday: byResult('ok'),
    newExceptions,
    confirmedErrors: confirmedErrors ?? 0,
    unreadableToday: byResult('unreadable'),
    byPicker, byProduct, recentExceptions,
  };
}

// ==================== הגדרות ====================
export async function getSettings() {
  const { data } = await supabaseAdmin().from('settings').select('*').eq('id', 1).single();
  return data;
}
export async function updateSettings(patch: any, uid: string) {
  const before = await getSettings();
  await supabaseAdmin().from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
  await audit('settings', null, 'update', before, patch, uid);
}

// ==================== עזרים ====================
async function audit(entity: string, entityId: string | null, action: string, oldV: any, newV: any, uid: string) {
  await supabaseAdmin().from('audit_log').insert({
    entity, entity_id: entityId, action, old_value: oldV, new_value: newV, user_id: uid,
  }).then(() => {}, () => {});
}
function firstDuplicateIndex(hashes: string[]): number {
  const seen = new Set<string>();
  for (let i = 0; i < hashes.length; i++) { if (seen.has(hashes[i])) return i; seen.add(hashes[i]); }
  return -1;
}
function dedupeExceptions(exs: CheckAnalysis['exceptions']) {
  const seen = new Set<string>();
  return exs.filter((e) => { if (seen.has(e.reasonCode)) return false; seen.add(e.reasonCode); return true; });
}
function rate(rows: any[], field: string) {
  const m: Record<string, { total: number; err: number }> = {};
  for (const r of rows) {
    const k = r[field] || 'לא ידוע';
    m[k] = m[k] || { total: 0, err: 0 };
    m[k].total++;
    if (r.overall_result === 'exception') m[k].err++;
  }
  return Object.entries(m).map(([k, v]) => ({ key: k, ...v, rate: pct(v.err, v.total) }));
}
function pct(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0; }
function nextDay(d: string) { const x = new Date(d); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); }
