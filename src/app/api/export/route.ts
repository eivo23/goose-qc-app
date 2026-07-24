import { requireManager, AuthError } from '@/lib/auth';
import { listChecks } from '@/lib/db';
import { fail } from '@/lib/http';
import { RESULT_HE, STATUS_HE } from '@/lib/reasons';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

// ייצוא כל הבדיקות ל-Excel
export async function GET() {
  try {
    requireManager();
    const checks = await listChecks({}, 5000);
    const rows = checks.map((c: any) => ({
      'מזהה': c.id,
      'תאריך': new Date(c.created_at).toLocaleString('he-IL'),
      'מלקט': c.picker_name,
      'לקוח': c.customer_name,
      'מס\' תמונות': c.images_count,
      'תוצאה': RESULT_HE[c.overall_result] ?? c.overall_result,
      'רמת ביטחון': c.confidence,
      'סטטוס': STATUS_HE[c.status] ?? c.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'בדיקות');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="checks-export.xlsx"`,
      },
    });
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
