'use client';
import { RESULT_HE, STATUS_HE } from '@/lib/reasons';

export function ResultBadge({ result }: { result: string }) {
  const map: Record<string, string> = {
    ok: 'badge-ok', exception: 'badge-alert', review: 'badge-review',
    unreadable: 'badge-muted', pending: 'badge-muted',
  };
  return <span className={map[result] || 'badge-muted'}>{RESULT_HE[result] ?? result}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge-muted">{STATUS_HE[status] ?? status}</span>;
}

export function Confidence({ value }: { value: number | null }) {
  if (value == null) return null;
  const cls = value >= 90 ? 'text-ok' : value >= 75 ? 'text-review' : 'text-alert';
  return <span className={`font-bold ${cls}`}>{value}%</span>;
}

export function Spinner() {
  return <div className="inline-block w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />;
}
