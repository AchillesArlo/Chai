/**
 * FASE 28.B — Deteksi MIME dari magic bytes. Tanpa dependency, tanpa percaya klien.
 *
 * Menebak tipe berkas dari byte awalnya ("magic number"), bukan dari Content-Type
 * yang diklaim klien. Ini menutup sebagian ancaman MIME-spoof (T-05): klien bisa
 * berbohong soal `mime_declared`, tetapi tidak bisa memalsukan byte pertama berkas.
 *
 * Cara pakai yang dituju: begitu ada jalur ingest byte nyata, server membandingkan
 * hasil ini dengan `mime_declared`. Ketidakcocokan adalah SINYAL untuk scan manual,
 * BUKAN penolakan otomatis — platform belum menyimpan byte asli untuk validasi
 * penuh, jadi kita tidak boleh menolak berdasarkan tebakan tak lengkap.
 *
 * ponytail: sengaja minimal + tanpa dependency. `SIGNATURES` menutup tanda tangan
 * kontainer/gambar/dokumen umum, plus heuristik teks ASCII konservatif. Batas atas
 * (ceiling): fungsi ini TIDAK mengenali setiap format — teks UTF-8 dengan karakter
 * multibyte, atau format di luar tabel, menghasilkan `null`. Pemanggil wajib
 * memperlakukan `null` sebagai "tak terdeteksi", bukan "aman". Upgrade path:
 * tambahkan entri ke `SIGNATURES`.
 */

interface MagicSignature {
  readonly mime: string;
  /** Byte prefix yang harus cocok mulai dari offset 0. */
  readonly prefix: readonly number[];
}

const SIGNATURES: readonly MagicSignature[] = [
  { mime: 'application/pdf', prefix: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
  { mime: 'image/png', prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', prefix: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', prefix: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // "GIF87a"
  { mime: 'image/gif', prefix: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // "GIF89a"
  { mime: 'application/zip', prefix: [0x50, 0x4b, 0x03, 0x04] }, // "PK\x03\x04" berkas lokal
  { mime: 'application/zip', prefix: [0x50, 0x4b, 0x05, 0x06] }, // arsip kosong
  { mime: 'application/zip', prefix: [0x50, 0x4b, 0x07, 0x08] }, // arsip terbagi (spanned)
];

/** Jumlah byte awal yang diperiksa heuristik teks. */
const TEXT_SNIFF_LIMIT = 512;

function startsWith(buffer: Uint8Array, prefix: readonly number[]): boolean {
  if (buffer.length < prefix.length) {
    return false;
  }
  return prefix.every((expected, index) => buffer[index] === expected);
}

/**
 * Heuristik teks konservatif: benar hanya bila SEMUA byte contoh adalah ASCII cetak
 * (0x20–0x7E) atau whitespace umum (tab/LF/CR). Byte 0x00 atau kontrol lain berarti
 * bukan teks. Konservatif = sedikit false-positive; teks non-ASCII (mis. UTF-8
 * multibyte) lolos sebagai `null`, dan itu diterima — pemanggil hanya kehilangan
 * sinyal, bukan salah menolak berkas.
 */
function looksLikeAsciiText(buffer: Uint8Array): boolean {
  if (buffer.length === 0) {
    return false;
  }
  const sample = buffer.subarray(0, TEXT_SNIFF_LIMIT);
  for (const byte of sample) {
    const isPrintable = byte >= 0x20 && byte <= 0x7e;
    const isWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (!isPrintable && !isWhitespace) {
      return false;
    }
  }
  return true;
}

/**
 * Mendeteksi tipe MIME dari byte awal `buffer`. Mengembalikan MIME string bila cocok
 * salah satu tanda tangan biner atau heuristik teks; `null` bila tidak dikenali.
 *
 * Tanda tangan biner diperiksa LEBIH DULU daripada heuristik teks. Berkas PDF diawali
 * "%PDF-" yang seluruhnya ASCII cetak, jadi tanpa urutan ini PDF akan salah dilabeli
 * `text/plain`.
 */
export function detectMimeFromMagicBytes(buffer: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (startsWith(buffer, signature.prefix)) {
      return signature.mime;
    }
  }
  if (looksLikeAsciiText(buffer)) {
    return 'text/plain';
  }
  return null;
}
