'use client';

import { useState } from 'react';
import { Copy, EyeOff, RotateCw } from 'lucide-react';

/**
 * SecretInput (REQ-04-010) — input untuk field rahasia yang TIDAK boleh
 * me-reveal nilai setelah tersimpan.
 *
 * Perilaku:
 * - Setelah save, tampilkan placeholder `••••••••••••` (read-only, tidak ada
 *   nilai asli di DOM).
 * - Tidak ada tombol "reveal"/"show" yang menampilkan plaintext.
 * - Tidak ada tombol "copy" untuk nilai secret (hanya untuk nilai publik).
 * - Tombol "Rotasi" memicu onRotate callback — nilai baru diisi sekali lalu
 *   dikirim ke server; field dikosongkan kembali setelah submit.
 *
 * Ponytail: tidak ada library baru — React state + lucide-react (sudah ada).
 */
interface SecretInputProps {
  /** Label untuk field. */
  label: string;
  /** True jika secret sudah tersimpan di server (mode masked). */
  hasExistingSecret: boolean;
  /**
   * Dipanggil saat user submit nilai secret baru (create/rotate). Return
   * Promise yang resolve saat server konfirmasi. Throw untuk menampilkan error.
   */
  onSave: (plaintext: string) => Promise<void>;
  /** Optional deskripsi helper di bawah label. */
  description?: string;
}

export function SecretInput({
  label,
  hasExistingSecret,
  onSave,
  description,
}: SecretInputProps) {
  const [mode, setMode] = useState<'masked' | 'editing' | 'saving'>(
    hasExistingSecret ? 'masked' : 'editing',
  );
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function handleSave() {
    if (!value) {
      setError('Nilai secret tidak boleh kosong.');
      return;
    }
    setError(null);
    setMode('saving');
    try {
      await onSave(value);
      setValue('');
      setMode('masked');
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan secret.');
      setMode('editing');
    }
  }

  if (mode === 'masked') {
    return (
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">{label}</label>
          <button
            type="button"
            onClick={() => setMode('editing')}
            className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"
          >
            <RotateCw className="size-3" /> Rotasi Kunci
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="password"
            readOnly
            value="••••••••••••"
            aria-label={`${label} (tersimpan, tersembunyi)`}
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500"
          />
          <EyeOff className="size-4 text-slate-400" aria-hidden="true" />
        </div>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        {savedAt && (
          <p className="mt-1 text-xs text-emerald-600">
            Secret diperbarui pada {savedAt.toLocaleString()}. Nilai lama tidak dapat ditampilkan kembali.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={hasExistingSecret ? 'Nilai baru untuk rotasi' : 'Tempel nilai secret'}
          aria-label={`${label} (input nilai baru)`}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={mode === 'saving'}
          className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {mode === 'saving' ? 'Menyimpan…' : hasExistingSecret ? 'Rotasi' : 'Simpan'}
        </button>
        {hasExistingSecret && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              setMode('masked');
              setError(null);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
          <Copy className="size-3" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
