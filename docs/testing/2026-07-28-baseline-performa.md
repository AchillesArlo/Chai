# Baseline Performa — Chai Platform (K-05)

> Diukur 2026-07-28 pada commit `1796441`+ terhadap stack staging Docker Compose
> yang dibangun dari `infra/Dockerfile` (image produksi), bukan `next dev` dan
> bukan mock. Ini pengukuran performa **pertama** yang pernah dilakukan pada
> repo ini — sebelumnya suite `tests/performance` selalu di-skip.

## Mengapa suite yang ada tidak bisa dipakai

`tests/performance/api-load.test.ts` dan `data-benchmarks.test.ts` digerbangi
`RUN_PERF_TESTS=true` dan berautentikasi lewat header `x-test-subject`. Header itu
hanya dihormati bila `APP_ENV` bernilai `local` atau `test`
(`apps/api/src/auth/local-identity.ts`), sehingga suite tersebut **tidak dapat
mengukur** deployment staging/produksi — setiap request akan 401.

Pengukuran di bawah memakai jalur autentikasi nyata: `POST /api/client/v1/auth/login`
untuk memperoleh Bearer token, lalu membebani endpoint terautentikasi.

## Lingkungan

- Docker Desktop (Windows), single node. Postgres, Redis, 3 replika API, 2
  realtime-gateway, 2 client-portal, 2 owner-console, dan nginx berbagi CPU host
  yang sama.
- Angka absolut karena itu **terikat lingkungan**; yang bermakna adalah urutan
  besaran dan ketiadaan error, bukan nilai mutlaknya.

## Hasil — langsung ke API (tanpa edge nginx)

Diukur dari dalam container API (`node /tmp/measure-api.mjs`), 25 request
konkuren, 500 request per endpoint.

| Endpoint | ok | throughput | p50 | p95 | p99 |
|---|---|---|---|---|---|
| `GET /api/v1/health` | 500/500 | 173 req/s | 106 ms | 278 ms | 328 ms |
| `GET /api/client/v1/conversations` (Bearer) | 500/500 | 217 req/s | 96 ms | 291 ms | 363 ms |
| `GET /api/client/v1/leads` (Bearer) | 500/500 | 281 req/s | 89 ms | 159 ms | 197 ms |

**Nol error, nol 5xx, nol timeout** pada 1.500 request. p95 tertinggi 291 ms,
masih di dalam target blueprint "analytics query < 500ms p95".

## Hasil — lewat nginx (edge)

| Endpoint | throughput | p50 | p95 |
|---|---|---|---|
| `GET /health` (tanpa auth, 20 konkuren) | 650 req/s | 29 ms | 51 ms |

Endpoint terautentikasi lewat nginx **sengaja tidak dijadikan baseline**: zona
`limit_req` edge (staging `rate=30r/s burst=50`, produksi `60r/s`) membatasi per
IP, jadi beban sintetis dari satu IP mengukur throttle proxy, bukan aplikasi.

## Temuan yang muncul dari pengukuran ini

**Throttling nginx membalas 503, bukan 429 — diperbaiki.** Saat beban melewati
zona `limit_req`, nginx memakai `limit_req_status` default `503`. Itu memberi
tahu klien bahwa server rusak dan mencemari SLO ketersediaan, padahal ini murni
persoalan laju klien. Ditambahkan `limit_req_status 429;` ke kedua konfigurasi
nginx, sejalan dengan envelope `RATE_LIMITED` milik API. Diverifikasi ulang:
throttling sekarang mengembalikan `429`.

## Cara mengulang pengukuran

```powershell
# 1. Nyalakan stack dan seed akun (lihat docs/PANDUAN_PENGGUNAAN.md)
# 2. Ukur langsung ke API, tanpa edge:
docker cp scripts/measure-api.mjs staging-api-1:/tmp/measure-api.mjs
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example `
  exec -T api node /tmp/measure-api.mjs
```

Skrip pengukur lewat edge ada di
`packages/database/src/measure-performance.ts` (dijalankan dari host).

## Batas pengukuran ini — jangan diklaim lebih dari isinya

- Hanya **tiga endpoint baca**. Jalur tulis (kirim balasan, buat lead,
  checkout pembayaran) belum diukur.
- Beban sintetis dari satu klien, satu IP, satu node. Bukan profil trafik nyata
  dan bukan uji ketahanan (soak/endurance).
- Tanpa data dalam jumlah besar: tenant uji nyaris kosong, jadi angka ini tidak
  mengukur perilaku pada tabel berisi ratusan ribu baris. Target blueprint
  "conversation list pagination: 1000 conversations" **belum** teruji.
- Tidak mengukur worker, dispatcher outbox/inbox, maupun realtime SSE.
