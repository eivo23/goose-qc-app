'use client';
// עזרי צד-לקוח לקריאות API

export async function api<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error || `שגיאה (${res.status})`);
  return json.data as T;
}

export async function apiForm<T = any>(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && json.ok !== false) resolve(json.data);
        else reject(new Error(json.error || `שגיאה (${xhr.status})`));
      } catch (e: any) { reject(new Error('תשובת שרת לא תקינה')); }
    };
    xhr.onerror = () => reject(new Error('כשל רשת - התמונות יישמרו וייעלו כשהחיבור יחזור'));
    xhr.send(form);
  });
}
