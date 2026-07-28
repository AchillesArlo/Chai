# Sertifikat TLS untuk nginx produksi

Direktori ini **wajib** berisi dua berkas sebelum `infra/production/docker-compose.yml`
dijalankan:

| Berkas | Isi |
|---|---|
| `cert.pem` | Rantai sertifikat server (fullchain) |
| `key.pem` | Kunci privat sertifikat itu |

`infra/production/nginx.conf` menyatakan `listen 443 ssl` dan merujuk
`/etc/nginx/ssl/cert.pem` serta `/etc/nginx/ssl/key.pem`. Tanpa kedua berkas itu
nginx **menolak start** dengan:

```
nginx: [emerg] cannot load certificate "/etc/nginx/ssl/cert.pem":
BIO_new_file() failed (... No such file or directory ...)
```

Itu bukan peringatan — nginx keluar, jadi seluruh edge publik (port 80 dan 443)
tidak pernah menyala. Sebelumnya direktori ini tidak ada di repo sama sekali dan
tidak didokumentasikan, sehingga `docker compose up` produksi gagal pada
percobaan pertama tanpa petunjuk penyebabnya.

## Berkas nyata tidak boleh masuk git

`.gitignore` di direktori ini mengabaikan `*.pem`: kunci privat tidak pernah
boleh ter-commit. Sediakan sertifikat lewat salah satu cara berikut, sesuai
kebijakan operasional Anda:

- **Let's Encrypt / ACME** — arahkan `cert.pem` dan `key.pem` ke hasil terbitan
  (mis. symlink dari `/etc/letsencrypt/live/<domain>/fullchain.pem` dan
  `privkey.pem`).
- **Secrets manager / CI** — tulis kedua berkas ke direktori ini saat deploy,
  jangan simpan di repo.
- **Terminasi TLS di depan Compose** — bila TLS diselesaikan load balancer di
  hulu (ALB, Cloudflare), hapus blok `listen 443 ssl` dari
  `infra/production/nginx.conf` dan biarkan nginx melayani HTTP saja. Jangan
  meninggalkan `listen 443 ssl` tanpa sertifikat.

## Verifikasi sebelum deploy

```bash
# Kedua berkas harus ada dan cocok satu sama lain.
openssl x509 -noout -modulus -in cert.pem | openssl md5
openssl rsa  -noout -modulus -in key.pem  | openssl md5   # kedua hash harus sama

# Konfigurasi nginx harus lolos uji dengan sertifikat terpasang.
docker run --rm \
  -v "$PWD/../nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD:/etc/nginx/ssl:ro" \
  nginx:alpine nginx -t
```

Untuk uji lokal saja (JANGAN dipakai di produksi), sertifikat self-signed cukup
untuk membuktikan nginx bisa start:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout key.pem -out cert.pem -subj "/CN=localhost"
```
