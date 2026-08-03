import { describe, expect, it } from 'vitest';

import { detectMimeFromMagicBytes } from './mime-detection';

/**
 * FASE 28.C(d): membuktikan detektor mengenali tiap tanda tangan di tabel dan
 * mengembalikan `null` untuk byte yang tidak cocok pola apa pun. Unit murni, tanpa
 * Docker, tanpa byte nyata — bermakna sebagai kontrak fungsi. (Catatan 28.B: belum
 * ada jalur ingest byte, jadi fungsi diuji berdiri sendiri, siap pakai nanti.)
 */
describe('detectMimeFromMagicBytes', () => {
  it('mendeteksi PDF dari "%PDF-"', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(detectMimeFromMagicBytes(bytes)).toBe('application/pdf');
  });

  it('mendeteksi PNG', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectMimeFromMagicBytes(bytes)).toBe('image/png');
  });

  it('mendeteksi JPEG', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMimeFromMagicBytes(bytes)).toBe('image/jpeg');
  });

  it('mendeteksi GIF87a dan GIF89a', () => {
    expect(detectMimeFromMagicBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]))).toBe('image/gif');
    expect(detectMimeFromMagicBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
  });

  it('mendeteksi ZIP beserta varian arsip kosong/terbagi', () => {
    expect(detectMimeFromMagicBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('application/zip');
    expect(detectMimeFromMagicBytes(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe('application/zip');
    expect(detectMimeFromMagicBytes(new Uint8Array([0x50, 0x4b, 0x07, 0x08]))).toBe('application/zip');
  });

  it('mendeteksi teks ASCII biasa lewat heuristik', () => {
    const bytes = new TextEncoder().encode('halo, dunia\n\tbaris ber-tab');
    expect(detectMimeFromMagicBytes(bytes)).toBe('text/plain');
  });

  it('mengutamakan tanda tangan biner di atas heuristik teks untuk header "%PDF-" (semuanya ASCII)', () => {
    // "%PDF-" seluruhnya ASCII cetak; tanpa urutan tanda-tangan-dulu ia akan salah
    // dilabeli text/plain.
    const bytes = new TextEncoder().encode('%PDF-1.7 sisa isi dokumen');
    expect(detectMimeFromMagicBytes(bytes)).toBe('application/pdf');
  });

  it('mengembalikan null untuk buffer kosong', () => {
    expect(detectMimeFromMagicBytes(new Uint8Array([]))).toBeNull();
  });

  it('mengembalikan null untuk biner yang tidak cocok tanda tangan mana pun (ada NUL + byte kontrol)', () => {
    expect(detectMimeFromMagicBytes(new Uint8Array([0x00, 0x01, 0x02, 0xff, 0x00]))).toBeNull();
  });

  it('mengembalikan null untuk buffer lebih pendek dari tanda tangan dan bukan teks (JPEG terpotong)', () => {
    // [0xFF, 0xD8] hanya 2 byte; JPEG butuh 3 (FF D8 FF). 0xFF bukan teks ASCII.
    expect(detectMimeFromMagicBytes(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});
