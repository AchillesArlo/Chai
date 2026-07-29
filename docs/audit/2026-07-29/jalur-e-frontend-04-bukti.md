# Jalur E — Bukti Dokumen 04 (`04_DESIGN_SYSTEM.md`)

> **Berkas pelengkap.** Berkas ini melengkapi **blok bukti** untuk 26 temuan dokumen 04
> (`REQ-04-001`..`REQ-04-026`) pada jalur audit E (Frontend, UX, Design System). Di
> `docs/audit/2026-07-29/jalur-e-frontend.md` ke-26 temuan itu **hanya ada sebagai baris
> tabel ringkasan** tanpa blok detail; **baris tabel ringkasannya tetap tinggal di
> `jalur-e-frontend.md`** — berkas ini tidak menggandakannya, hanya menambah substansinya.
> Pemisahan berkas dilakukan karena agen lain sedang menambah `REQ-03-021`..`040` ke
> `jalur-e-frontend.md`; dua penulis pada satu berkas akan saling menimpa.
>
> **Cakupan dibaca penuh.** `04_DESIGN_SYSTEM.md` dibaca dari baris 1 sampai 399 (§1
> Design Direction sampai §14 Payment and Logistics Components). Tidak ada bagian yang
> disampel atau dilewati.
>
> **Aturan bukti yang dipakai** (mengikuti `docs/plans/2026-07-27-rencana-audit-blueprint.md`
> §10.4–10.5): `TERPENUHI` hanya bila berkasnya sudah dibuka **dan** terbukti dirender di
> jalur produksi (`path:baris` + call site). Komponen yang terdefinisi tetapi tidak dirender
> di route mana pun **bukan** `TERPENUHI`. Atribut ARIA tanpa pola keyboard yang benar-benar
> diimplementasikan = `SEBAGIAN`. `HILANG` disertai perintah pencarian nol hasil. Semua
> pencarian dijalankan sebagai regex lintas berkas (`*.tsx`/`package.json`) di `apps/` dan
> `packages/ui/`; setara `Select-String -Path <glob> -Pattern '<pola>'`.

---

## Temuan lintas-cakupan khusus dokumen 04 (dirujuk oleh banyak REQ)

- **D-1 Banyak komponen `@chai/ui` terdefinisi tetapi tak pernah dirender di route.**
  Sensus impor `@chai/ui` di seluruh `apps/**/*.tsx` hanya memakai
  `AppShell, MetricCard, StatusBadge, MoneyAmount, EventTimeline, SavingIndicator, PageState`.
  Yang **tidak** diimpor di route mana pun: `DataTable`, `Chart`, `Modal`, `Tabs`,
  `Dropdown`, `Avatar`, `Badge`, `Form`, `Toast`/`ToastProvider`/`useToast`,
  `DataStateBanner`, `OfflineNotice`, `SavingOverlay`. Perintah:
  `Select-String apps/**/*.tsx -Pattern "<DataTable|<Chart\b|<Modal\b|<Tabs\b|<Dropdown\b|<Avatar\b|<Form\b|<Badge\b|useToast|<Toast"` → 0 hasil (hanya elemen HTML `<form>` native yang cocok). Berdampak ke REQ-04-011/013/014/017/021.
- **D-2 Komponen memakai palet mentah Tailwind, bukan token semantik.** Token semantik
  spesifikasi (`bg-default`, `text-primary`, `action-primary`, `border-focus`,
  `status-*`) tidak ada di kode — hanya muncul di teks blueprint. Komponen memakai kelas
  `slate-*`/`red-*`/`emerald-*`/`amber-*`/`blue-*`/`brand-*` langsung. Berdampak ke
  REQ-04-002/006/012.
- **D-3 Provider aplikasi hanya memasang `QueryProvider` + `SessionGuard`.**
  `apps/client-portal/src/app/providers.tsx:26-32` dan
  `apps/owner-console/src/app/providers.tsx:26-32` — tidak ada `ToastProvider` maupun
  `ThemeProvider` di pohon render. Berdampak ke REQ-04-001/013.
- **D-4 Konvensi kelas** (sama seperti `jalur-e-frontend.md`): `HILANG` = deliverable
  belum dibangun (dibuktikan pencarian nol); `SEBAGIAN`/`BERTENTANGAN` = ada tetapi salah
  atau tidak lengkap. Satu koreksi kelas terhadap tabel ringkasan dicatat di REQ-04-015.

---

## DOKUMEN 04 — Blok temuan

### REQ-04-001 - Default theme light + arsitektur token memungkinkan dark mode tanpa ubah component - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §1`): "Default theme: light. Token architecture harus memungkinkan dark mode kemudian tanpa mengubah components."

**Kondisi nyata**: Default light terpenuhi — background app dipatok `#f8fafc` dan teks `#0f172a` di `packages/ui/src/tokens.css:13-23`. Namun arsitektur token **tidak** menyiapkan dark mode: tidak ada layer token light/dark, tidak ada selektor `.dark`/`[data-theme]`, tidak ada varian `dark:` maupun `prefers-color-scheme`. Warna dipatok nilai mentah, sehingga dark mode menuntut penyuntingan komponen — persis yang dilarang. `ThemeProvider` whitelabel yang ada pun tidak dipasang (D-3), jadi tak ada mekanisme peralihan tema.

**Bukti**:
- `packages/ui/src/tokens.css:1-6,13-23` - token `--brand-*`/`--surface` + background/teks light dipatok nilai hex
- `apps/client-portal/src/app/globals.css:5-13` & `apps/owner-console/src/app/globals.css:5-13` - blok `@theme` hanya brand + font, tanpa pasangan token dark
- Perintah: `Select-String -Path packages/**,apps/** -Pattern "prefers-color-scheme|data-theme|dark:bg-|dark:text-"` → 0 hasil di kode (hanya di teks `04_DESIGN_SYSTEM.md`)

**Yang kurang**: layer token semantik dua-tema (mis. `--bg-default` yang berganti nilai di `[data-theme="dark"]`) sehingga dark mode tak menyentuh komponen.

---

### REQ-04-002 - Token warna lengkap + token semantik (bukan palet mentah) dipakai component - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §2.1`): "Semantic tokens, bukan raw palette, dipakai component" + tabel token warna lengkap (brand, neutral-950..50, success/warning/danger/info-600).

**Kondisi nyata**: Hanya sebagian palet didefinisikan sebagai token (`--brand-50/500/600/700`, `--surface`); skala `neutral-*` dan `success/warning/danger/info` tidak ada sebagai token dan disandarkan pada default Tailwind (`slate/red/emerald/amber/blue`). Token **semantik** yang diwajibkan (`bg-default`, `text-primary`, `action-primary`, `border-focus`, `status-*`) tidak ada sama sekali di kode; komponen memakai palet mentah (mis. `badge.tsx:11-25` memakai `bg-red-50 text-red-700`, `bg-emerald-50`, dst.).

**Bukti**:
- `packages/ui/src/tokens.css:1-6` - hanya brand + surface sebagai token
- `packages/ui/src/badge.tsx:11-25` - `toneStyles`/`dotColors` memakai `red-*`/`emerald-*`/`amber-*`/`blue-*` langsung
- Perintah: `Select-String -Path packages/**,apps/** -Pattern "--color-bg-default|--color-text-primary|action-primary|border-focus|bg-subtle|text-muted"` → 0 hasil di kode (hanya di blueprint)

**Yang kurang**: definisi token semantik + skala neutral/status penuh, lalu refactor komponen agar merujuk token semantik alih-alih kelas palet mentah.

---

### REQ-04-003 - Typography scale Inter (9 style) - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §2.2`): "Default font: Inter dengan system fallback." + tabel 9 style (display/h1/h2/h3/body-lg/body/body-medium/caption/mono) dengan size/line/weight tertentu.

**Kondisi nyata**: `--font-sans: Inter, ...` diset di kedua `globals.css` (jalur produksi lewat `layout.tsx` → `globals.css`), tetapi Inter hanya **dirujuk berdasarkan nama**, tidak dimuat (`next/font` maupun `@font-face` tidak ada di `layout.tsx`), sehingga jatuh ke fallback sistem bila Inter tak terpasang di OS. Ke-9 style tidak diformalkan menjadi token/utilitas; komponen memakai kelas ukuran mentah Tailwind (`text-2xl`, `text-lg`, `text-sm`, `text-xs`, `font-mono`) tanpa skema `display/h1/...`.

**Bukti**:
- `apps/client-portal/src/app/globals.css:11-12` - `--font-sans`/`--font-mono` (nama, bukan pemuatan font)
- `apps/client-portal/src/app/layout.tsx:1-19` - tidak ada `next/font`
- Perintah: `Select-String -Path packages/**,apps/** -Pattern "next/font|@font-face|--text-display|--text-h1"` → 0 hasil

**Yang kurang**: pemuatan font Inter yang deterministik + token skala tipografi 9-style agar ukuran/berat tak dipilih ad hoc.

---

### REQ-04-004 - Spacing base-4, skala terbatas - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §2.3`): "Base unit 4 px. Allowed scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64."

**Kondisi nyata**: Grid 4px terpenuhi secara implisit lewat default Tailwind v4, tetapi tidak ada pembatasan pada skala yang diizinkan; komponen memakai langkah setengah di luar skala (`py-0.5`=2px, `gap-1.5`=6px, `mt-1.5`=6px, `pt-20`=80px) yang tidak ada dalam daftar {4,8,12,…,64}.

**Bukti**:
- `packages/ui/src/badge.tsx:33` - `px-2.5 py-0.5` (2px vertikal, di luar skala)
- `packages/ui/src/operational.tsx:83` - `gap-1.5` (6px, di luar skala)
- Tidak ada `tailwind.config.*` (Tailwind v4; glob `apps/*/tailwind.config.*` → 0 hasil) yang membatasi `spacing` ke skala spesifikasi

**Yang kurang**: pembatasan skala spacing (mis. override `--spacing-*`) atau lint token agar langkah 2px/6px tidak dipakai di komponen produk.

---

### REQ-04-005 - Radius scale 6/10/14/full - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §2.4`): "small 6 px: inputs/chips; medium 10 px: cards/dialog controls; large 14 px: major panels; full: avatar/status pill."

**Kondisi nyata**: Tidak ada token radius terdefinisi; komponen memakai default Tailwind `rounded-md`(6px), `rounded-lg`(8px), `rounded-xl`(12px), `rounded-full`. Nilai `full` dan `small`≈6px (via `rounded-md`) cocok, tetapi `medium` seharusnya 10px (dipakai 8px) dan `large` 14px (dipakai 12px) — skala spesifikasi tidak ditegakkan.

**Bukti**:
- `packages/ui/src/data-table.tsx:60,71` - panel/kartu memakai `rounded-xl` (12px, bukan 14px)
- `packages/ui/src/badge.tsx:33` - pill memakai `rounded-full` (cocok)
- Perintah: `Select-String -Path packages/**,apps/** -Pattern "--radius|rounded-\[10px\]|rounded-\[14px\]"` → 0 hasil

**Yang kurang**: token radius 6/10/14/full dan pemakaiannya menggantikan `rounded-md/lg/xl` default.

---

### REQ-04-006 - Elevation 4 level + borders before shadows - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §2.5`): "level 0: page; level 1: card; level 2: dropdown/sticky; level 3: dialog/drawer. Use borders before shadows for dense operational screens."

**Kondisi nyata**: "Border sebelum shadow" sebagian dihormati — kartu konsisten `border border-slate-200 ... shadow-sm`. Namun tidak ada sistem elevation 4-level yang diformalkan; nilai bayangan dipilih ad hoc dari seluruh rentang Tailwind (`shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`) tanpa pemetaan ke level 0–3.

**Bukti**:
- `packages/ui/src/operational.tsx:14` - kartu `border ... shadow-sm` (border+shadow)
- `packages/ui/src/app-shell.tsx` - overlay memakai `shadow-xl`/`shadow-2xl` ad hoc (mis. modal profil/pencarian)
- Perintah: `Select-String -Path packages/**,apps/** -Pattern "--elevation|level-0|level-1|level-2|level-3"` → 0 hasil

**Yang kurang**: token elevation 4-level yang dipetakan ke page/card/dropdown/dialog agar bayangan tidak dipilih bebas.

---

### REQ-04-007 - Layout breakpoints + grid (form 720, settings 960, card min 260) - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §3`): tabel breakpoint sm/md/lg/xl/2xl = 640/768/1024/1280/1536; "Forms max width: 720 px; Narrative/settings pages max width: 960 px; Card grid: minimum 260 px per card."

**Kondisi nyata**: Breakpoint cocok dengan default Tailwind v4 (640/768/1024/1280/1536) yang identik dengan spesifikasi, jadi bagian ini efektif terpenuhi tanpa konfigurasi. Namun kendala grid tidak ditegakkan: batas lebar form 720px dan settings 960px tidak ada (halaman settings malah `max-w-5xl`=1024px), dan minimum kartu 260px tidak dipakai.

**Bukti**:
- `apps/client-portal/src/app/settings/page.tsx:88` - kontainer `max-w-5xl` (1024px), bukan 960px
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "max-w-\[720|max-w-\[960|minmax\(260|min-w-\[260"` → 0 hasil
- Tidak ada `tailwind.config.*` (glob `apps/*/tailwind.config.*` → 0 hasil); breakpoint memakai default v4

**Yang kurang**: penerapan batas lebar 720/960 pada form/settings dan `minmax(260px, …)` pada card grid.

---

### REQ-04-008 - Navigation components + TenantSwitcher memberships-only + owner repeat-name confirm - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §4.1`): daftar komponen (AppSidebar, SidebarGroup, TopBar, TenantSwitcher, Breadcrumb, MobileBottomNav, CommandSearch); "owner version can search all tenants; client version lists memberships only; selected tenant shown persistently; destructive owner actions repeat tenant name in confirmation."

**Kondisi nyata**: `AppShell` dirender di setiap route kedua app (mis. `apps/client-portal/src/client-home.tsx:8`, `apps/owner-console/src/owner-overview.tsx:105`), menyediakan sidebar, TopBar, MobileBottomNav, dan CommandSearch (modal pencarian). Namun: **Breadcrumb** dan **SidebarGroup** tidak ada. **TenantSwitcher** memakai daftar `AVAILABLE_TENANTS` yang **dipatok** dan **sama untuk owner maupun client** — bukan membership, dan owner tidak bisa "search all tenants" (dropdown tenant tak punya kotak cari; CommandSearch hanya memfilter label navigasi). Tidak ada konfirmasi ulang-nama-tenant untuk aksi destruktif owner.

**Bukti**:
- `packages/ui/src/app-shell.tsx:60-65` - `AVAILABLE_TENANTS` konstan (4 contoh), dipakai untuk `surface` owner & client
- `packages/ui/src/app-shell.tsx:159-183` - dropdown tenant me-render `AVAILABLE_TENANTS.map(...)`, tanpa input pencarian
- `packages/ui/src/app-shell.tsx:441-447` - CommandSearch memfilter `navigation` (label nav), bukan tenant
- Perintah: `Select-String packages/ui/src/app-shell.tsx -Pattern "Breadcrumb|SidebarGroup|membership|repeat.*name"` → 0 hasil

**Yang kurang**: daftar tenant dari membership (client) + pencarian semua tenant (owner); Breadcrumb & SidebarGroup; konfirmasi ulang-nama pada aksi destruktif owner.

---

### REQ-04-009 - Actions: Button/IconButton/SplitButton/ApprovalButton + one primary per area - HILANG - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §4.2`): "Button: primary, secondary, ghost, danger, link. IconButton requires tooltip and accessible label. SplitButton … ApprovalButton displays required approver/risk. Only one primary button per local decision area."

**Kondisi nyata**: Tidak ada satu pun komponen Actions dari set ini. `@chai/ui` tidak mengekspor modul `button` (`packages/ui/src/index.ts:1-13`), dan `IconButton`/`SplitButton`/`ApprovalButton` tidak ada. Tombol di seluruh aplikasi adalah elemen `<button>` inline dengan kelas `bg-brand-600` yang diulang manual; tidak ada sistem varian (ghost/danger/link), tidak ada `ApprovalButton` (approver/risk), tidak ada tooltip/label wajib untuk icon-button. (Catatan: tombol memang **dirender** inline; yang HILANG adalah *set komponen* Actions design-system, bukan tombol secara umum.)

**Bukti**:
- `packages/ui/src/index.ts:1-13` - tidak ada `export * from './button'`
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "SplitButton|ApprovalButton|IconButton"` → 0 hasil (kecuali komentar `{/* Help Button & Popover */}` di `app-shell.tsx:235`)
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "<Button\b"` → 0 hasil (hanya `<button>` HTML native)

**Yang kurang**: komponen `Button` bervarian + `IconButton`(tooltip/label) + `SplitButton` + `ApprovalButton`(approver/risk), dan aturan satu-primary-per-area yang ditegakkan komponen.

---

### REQ-04-010 - Forms components (12) + SecretInput tanpa reveal setelah save - SEBAGIAN - HIGH

**Persyaratan** (`04_DESIGN_SYSTEM §4.3`): daftar 12 komponen form (TextField, TextArea, Select/Combobox, MultiSelect, Date/Time/Timezone picker, Phone/ChannelIdentity, FileUploader, SecretInput, PolicyBuilder, FormSection, InlineValidation); "SecretInput never supports reveal after initial save. Rotation creates new credential version."

**Kondisi nyata**: Tidak ada komponen form bernama itu (`SecretInput`, `PolicyBuilder`, `MultiSelect`, `FileUploader`, `Combobox`, `InlineValidation`, `FormSection` → 0 hasil); form dibuat dari `<input>`/`<textarea>`/`<select>` inline. Aturan keamanan `SecretInput` **dilanggar**: halaman settings menampilkan tombol **salin rahasia** yang mengembalikan nilai secret penuh setelah disimpan, dan menyimpan token kanal ke `localStorage` dalam bentuk polos. Ini yang mengangkat severity ke HIGH.

**Bukti**:
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "SecretInput|PolicyBuilder|MultiSelect|FileUploader|Combobox|InlineValidation|FormSection"` → 0 hasil
- `apps/client-portal/src/app/settings/page.tsx:342,352` - Client Secret `readOnly` + tombol `copyToClipboard('chai_sec_live_98a7b6c5d4e3f210', 'secret')` = reveal-setelah-save
- `apps/client-portal/src/app/settings/page.tsx:78` - `localStorage.setItem('chai_client_settings', …)` menyimpan token (`waAccessToken`/`telegramToken`) polos
- `apps/owner-console/src/app/marketplace/page.tsx:211` - secret provider `type="password" defaultValue="sec_meta_891237198237"` (nilai polos di markup)

**Yang kurang**: komponen `SecretInput` yang tak pernah mengembalikan nilai setelah simpan (rotasi = versi baru) menggantikan input password inline + hapus penyimpanan secret di `localStorage`; komponen form standar lain (12 item).

---

### REQ-04-011 - Data display components (11) + DataTable 8 requirement - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §4.4`): 11 komponen (MetricCard, DataTable, FilterBar, SavedView, KeyValueList, Timeline, AuditEvent, HealthMatrix, EmptyState, DataFreshness, CostBadge); DataTable wajib: server pagination, sortable, filter chips, column visibility, sticky header, keyboard row navigation, accessible mobile card fallback, export permission terpisah.

**Kondisi nyata**: Sebagian komponen ada & dirender: `MetricCard` (mis. `client-home.tsx`), `EventTimeline` (=Timeline; `shipments/page.tsx:67`), `PageState` state empty (=EmptyState; `*/loading.tsx`/`error.tsx`), `freshness` pada MetricCard (=DataFreshness parsial). `DataTable` **ada tetapi tidak dirender di route mana pun** (0 impor, lihat D-1), dan hanya memenuhi 2 dari 8 syarat: sortable (`data-table.tsx:38-52`) + empty message (`:59-65`); tidak ada server pagination, filter chips, column visibility, sticky header, keyboard row navigation, mobile card fallback, maupun pemisahan izin export. `FilterBar`, `SavedView`, `KeyValueList`, `AuditEvent`, `HealthMatrix`, `CostBadge` tidak ada.

**Bukti**:
- `packages/ui/src/data-table.tsx:38-65` - hanya sort + empty; sisanya 6 syarat tak ada
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "<DataTable"` → 0 hasil (DataTable tak dirender)
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "FilterBar|SavedView|KeyValueList|AuditEvent|HealthMatrix|DataFreshness|CostBadge"` → 0 hasil

**Yang kurang**: render DataTable di route + 6 syarat DataTable yang hilang; komponen FilterBar/SavedView/KeyValueList/AuditEvent/HealthMatrix/CostBadge.

---

### REQ-04-012 - Status components + status language + badge selalu text (+icon) - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §4.5`): tabel bahasa status per domain (Tenant/Conversation/Channel/Knowledge/Workflow/Action/Payment/Shipment/Reconciliation); "Status badge always includes text and optional icon."

**Kondisi nyata**: `StatusBadge` (`operational.tsx:70-86`) dirender luas dan **selalu menyertakan teks** — bagian "always includes text" terpenuhi. Namun dua masalah: (1) bahasa status tidak mengikuti kosakata kanonik spesifikasi — route mengoper enum backend mentah (`PAID`/`PENDING`/`SUCCEEDED`, `OPEN`/`PENDING_AGENT`/`RESOLVED`, `AKTIF`) alih-alih label spesifikasi (mis. Payment "Waiting for payment/Processing/Paid/Expired…"); (2) "optional icon" dilanggar arah sebaliknya — `StatusBadge` **memaksa** ikon default `CheckCircle2` (centang) untuk semua tone, sehingga badge `danger`/`warning` tetap menampilkan centang yang menyesatkan.

**Bukti**:
- `packages/ui/src/operational.tsx:83` - `{icon ?? <CheckCircle2 …/>}` → centang dipaksa saat icon tak diberikan
- `apps/client-portal/src/app/payments/page.tsx:17-21,80` - `statusTone` + `<StatusBadge label={payment.status} …/>` tanpa icon (badge FAILED tampil centang)
- `apps/client-portal/src/unified-inbox.tsx:281` - status `PENDING_AGENT`/`OPEN`/`RESOLVED` (bukan Open/Waiting/Human active/Resolved)

**Yang kurang**: peta kosakata status kanonik per domain + hentikan ikon centang default (ikon per tone atau tanpa ikon), agar tone danger/warning tak bercentang.

---

### REQ-04-013 - Feedback: InlineAlert/Toast/Banner/Progress/Skeleton/ErrorBlock - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §4.6`): "InlineAlert for persistent context; Toast for transient success; Banner for global/tenant incident; Progress for multi-step work; Skeleton for loading; ErrorBlock with correlation ID."

**Kondisi nyata**: Yang ada & dirender: **ErrorBlock** (`PageState` state error dengan correlation ID, `page-state.tsx:44-73`, dipakai di `*/error.tsx`) dan loading state (spinner, bukan Skeleton). **Toast** terdefinisi (`toast.tsx`) tetapi `ToastProvider`/`useToast` **tidak dipasang/dipakai** di aplikasi mana pun (D-3), jadi tak ada di jalur produksi. `InlineAlert`, `Banner`, `Progress`, `Skeleton` tidak ada sebagai komponen; peringatan yang muncul adalah div inline ad hoc (mis. `settings/page.tsx` "savedAlert").

**Bukti**:
- `packages/ui/src/page-state.tsx:44-73` - ErrorBlock (correlation ID) + loading spinner; dirender via `apps/*/error.tsx`, `loading.tsx`
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "useToast|<Toast|ToastProvider"` → 0 hasil (Toast tak terpasang)
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "InlineAlert|<Banner\b|Progress|Skeleton"` → 0 hasil (hanya komentar/teks)

**Yang kurang**: pasang ToastProvider + komponen InlineAlert/Banner(incident global)/Progress(multi-step)/Skeleton(loading) yang dirender.

---

### REQ-04-014 - Overlays: Dialog/Drawer/FullScreenFlow/Popover + nested dialog dilarang - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §4.7`): "Dialog: short decision; Drawer: contextual detail/filter; FullScreenFlow: complex onboarding/editor; Popover: lightweight details. Nested dialogs are prohibited."

**Kondisi nyata**: `Modal` (=Dialog) ada dengan a11y dasar (`modal.tsx:44-46` `role="dialog"`+`aria-modal`, Escape di `:28-31`) tetapi **tidak diimpor/dirender di route mana pun** (0 impor, D-1). Overlay yang benar-benar dipakai adalah div inline **tanpa** `role="dialog"`/`aria-modal` dan tanpa focus-trap (mis. modal pencarian & profil di `app-shell.tsx`, modal "Create Conversation" di `unified-inbox.tsx`). `Drawer`, `FullScreenFlow`, `Popover` tidak ada. Larangan nested dialog tak dapat ditegakkan komponen.

**Bukti**:
- `packages/ui/src/modal.tsx:28-46` - Modal (role=dialog, aria-modal, Escape), tetapi Perintah: `Select-String apps/**/*.tsx -Pattern "<Modal\b"` → 0 hasil
- `apps/client-portal/src/unified-inbox.tsx:395-410` - overlay "Create Conversation" = div inline `fixed inset-0`, tanpa role/aria-modal
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "Drawer|FullScreenFlow|<Popover"` → 0 hasil (hanya komentar `Popover` di `app-shell.tsx:235`)

**Yang kurang**: render Modal untuk dialog + komponen Drawer/FullScreenFlow/Popover; ganti overlay div inline dengan Dialog ber-semantik (focus-trap) untuk memenuhi larangan nested & a11y.

---

### REQ-04-015 - Conversation components (16) + visual distinction AI/human/note/failed/tool - SEBAGIAN - MEDIUM

**Koreksi kelas**: tabel di `jalur-e-frontend.md` menyebut **HILANG**, seharusnya **SEBAGIAN** — karena bubble pesan **benar-benar dirender** inline di `unified-inbox.tsx:298-305` dengan satu pembedaan (inbound customer kiri/netral vs outbound kanan), sehingga `HILANG` (yang menuntut pencarian nol) tidak bisa ditegakkan untuk REQ ini secara utuh.

**Persyaratan** (`04_DESIGN_SYSTEM §5`): 16 komponen (ConversationListItem, MessageBubble, InternalNoteBubble, AIAnswerEvidence, DeliveryStatus, AttachmentPreview, Composer, SuggestedReply, TakeoverBanner, SLAIndicator, CustomerContextPanel, ToolActionCard, PaymentRequestCard, ShipmentStatusCard, TrackingTimeline, DeliveryExceptionCard) + pembedaan visual: inbound netral kiri; outbound AI brand-subtle kanan + label AI; outbound human surface kanan + avatar; internal note warning-subtle; failed danger + retry; tool action kartu.

**Kondisi nyata**: Inbox me-render bubble inline: `m.sender === 'customer'` → kiri `bg-slate-100` (netral) selebihnya → kanan `bg-brand-600 text-white`. Jadi **inbound-netral-kiri** terpenuhi, tetapi **AI dan human tidak dibedakan** (keduanya `bg-brand-600`, tanpa label AI/avatar), dan tidak ada gaya internal note/failed-retry/tool-card. Selain itu backend tak memasok riwayat (`toRow` mengeset `messages: []` di `:56`), sehingga bubble hanya muncul untuk balasan yang dikirim di sesi berjalan. Ke-16 komponen bernama tidak ada sebagai komponen.

**Bukti**:
- `apps/client-portal/src/unified-inbox.tsx:298-305` - bubble inline: `justify-start`+`bg-slate-100` (customer) vs `justify-end`+`bg-brand-600 text-white` (AI & human identik)
- `apps/client-portal/src/unified-inbox.tsx:56` - `messages: []` (riwayat dari backend tak dipetakan)
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "MessageBubble|InternalNoteBubble|AIAnswerEvidence|SuggestedReply|TakeoverBanner|SLAIndicator|CustomerContextPanel|ToolActionCard|TrackingTimeline|DeliveryExceptionCard"` → 0 hasil (hanya di `unified-inbox-reply.test.tsx`)

**Yang kurang**: pembedaan AI vs human (label AI/avatar), gaya internal-note/failed-retry/tool-card, dan komponen percakapan bernama (mis. MessageBubble, Composer lengkap, CustomerContextPanel, AIAnswerEvidence).

---

### REQ-04-016 - AI components (9) + hindari confidence % pseudo-ilmiah - HILANG - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §6`): 9 komponen (ModelAliasBadge, Confidence/EvidenceIndicator, SourceCitationList, ToolProposalCard, ApprovalCard, PromptVersionChip, AITraceSummary, CostTokenSummary, GuardrailEvent); "Avoid displaying a single pseudo-scientific confidence percentage … Prefer: strong evidence; partial evidence; no approved evidence; human review required."

**Kondisi nyata**: Tidak ada satu pun dari 9 komponen AI ini di kode. Tidak ada pula indikator kekuatan-bukti (strong/partial/no-evidence/human-review) yang diwajibkan sebagai pengganti confidence %. Aturan "hindari confidence %" tidak dilanggar hanya karena tak ada UI AI sama sekali — tetapi deliverable komponennya HILANG.

**Bukti**:
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "ModelAliasBadge|EvidenceIndicator|SourceCitationList|ToolProposalCard|ApprovalCard|PromptVersionChip|AITraceSummary|CostTokenSummary|GuardrailEvent"` → 0 hasil
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "confidence|strong evidence|human review"` → 0 hasil relevan (satu-satunya "evidence" = "tamper-evidence" di `audit/page.tsx:41`, tak terkait AI)

**Yang kurang**: seluruh set komponen AI (evidence indicator berbasis kekuatan-bukti, ToolProposalCard/ApprovalCard dengan approver/risk, SourceCitationList, AITraceSummary, CostTokenSummary, GuardrailEvent).

---

### REQ-04-017 - Analytics chart (6 tipe) + chart rules (title/unit/tz/freshness/table alt) - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §7`): 6 tipe (Line, Bar, Stacked bar/area, Funnel, Heatmap, Table); aturan: setiap chart punya title/question/unit/timezone/freshness, comparison period eksplisit, warna stabil lintas halaman, zero vs missing dibedakan, dan alternatif tabel yang dapat diunduh.

**Kondisi nyata**: Komponen `Chart` ada tetapi hanya 2 dari 6 tipe (bar, line) dan **tidak dirender di route mana pun** (0 impor, D-1). Halaman analitik klien memakai **hanya MetricCard** di ketujuh tab — tidak ada chart sama sekali. Tidak ada aturan chart (title/unit/tz/freshness/comparison/tabel alt); warna dipatok `#6366f1`. Karena ada komponen chart parsial (walau tak dirender), kelasnya SEBAGIAN, bukan HILANG.

**Bukti**:
- `packages/ui/src/chart.tsx:12-18` - hanya `type?: 'bar' | 'line'`; tanpa title/unit/tz/freshness/tabel
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "<Chart"` → 0 hasil (Chart tak dirender)
- `apps/client-portal/src/client-analytics.tsx` - 7 tab hanya `MetricCard`, tidak ada chart

**Yang kurang**: tipe stacked/area/funnel/heatmap/table; render chart di analitik; aturan chart (title/unit/tz/freshness/comparison, zero-vs-missing, warna semantik stabil, alternatif tabel unduh).

---

### REQ-04-018 - Forms & validation rules (blur+submit, server→field, unsaved guard, publish diff) - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §8`): "Validate on blur and submit; error text says how to fix; server error maps to field; preserve values after retryable failure; unsaved change guard on complex settings; publish action shows diff summary; timezone appears beside every scheduling input; destructive form separates impact preview from confirmation."

**Kondisi nyata**: Komponen `Form` (`form.tsx`) memvalidasi **hanya saat submit** (`:49 validate()`), tidak on-blur (0 `onBlur` di seluruh `packages/ui`), dan **tidak dipakai di route mana pun** (0 impor). Form aplikasi adalah input inline tanpa validasi (mis. settings hanya simpan ke localStorage). Yang terpenuhi hanya *preserve values after retryable failure* di inbox (teks balasan dipertahankan saat 409/412). Tidak ada pemetaan server-error→field, unsaved-change guard, publish diff summary; timezone tidak muncul di sisi input penjadwalan bookings.

**Bukti**:
- `packages/ui/src/form.tsx:49,94` - validasi di `handleSubmit` saja + `onChange` clear-error; Perintah: `Select-String packages/ui/src -Pattern "onBlur"` → 0 hasil
- `apps/client-portal/src/unified-inbox.tsx:135-179` - teks balasan dipertahankan; hanya di-clear saat sukses (`:169`)
- `apps/client-portal/src/app/bookings/page.tsx:69-71` - `startsAt`/`endsAt` ditampilkan tanpa timezone di sisinya

**Yang kurang**: validasi on-blur, pemetaan server-error→field, unsaved-change guard di settings kompleks, publish diff summary, timezone di setiap input penjadwalan, pemisahan impact-preview vs confirmation pada form destruktif.

---

### REQ-04-019 - Iconography Lucide, icon supplemental, attachment no auto-execute - SEBAGIAN - LOW

**Persyaratan** (`04_DESIGN_SYSTEM §10`): "Icon set: Lucide or equivalent; Icon is supplemental, not sole label; Customer/avatar fallback uses initials with deterministic color; Attachment thumbnail never auto-executes active content."

**Kondisi nyata**: Lucide dipakai (`lucide-react@1.24.0` di kedua app), dan ikon umumnya suplemental — `aria-hidden="true"` + teks label di sampingnya (mis. `app-shell.tsx` NavigationLink ikon+`<span>`). Namun **warna avatar tidak deterministik**: `Avatar` selalu `bg-brand-100` (`avatar.tsx:36-41`) — dan `Avatar` bahkan tak dirender di route (app-shell memakai inisial inline `bg-slate-900`). Fitur attachment tidak ada, sehingga aturan "thumbnail tak auto-execute" tak berlaku (tidak ada thumbnail untuk dinilai) — bukan bukti kepatuhan.

**Bukti**:
- `apps/client-portal/package.json:20` & `apps/owner-console/package.json:19` - `"lucide-react": "1.24.0"`
- `packages/ui/src/avatar.tsx:36-41` - fallback inisial selalu `bg-brand-100` (warna tidak diturunkan dari nama)
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern "dangerouslySetInnerHTML|AttachmentPreview|<iframe|download=|autoplay"` → 0 hasil (tak ada rendering attachment)

**Yang kurang**: warna avatar deterministik (hash nama→warna) + render Avatar di route; bila attachment ditambahkan kelak, jamin thumbnail tak mengeksekusi konten aktif.

---

### REQ-04-020 - Motion: respect prefers-reduced-motion - TERPENUHI - -

**Persyaratan** (`04_DESIGN_SYSTEM §11`): "Respect prefers-reduced-motion."

**Kondisi nyata**: `tokens.css` memuat blok global `@media (prefers-reduced-motion: reduce)` yang memangkas transition/animation ke 0.01ms dan `scroll-behavior: auto`. Berkas ini berada di jalur produksi: `globals.css` kedua app `@import '@chai/ui/tokens.css'`, dan `globals.css` diimpor `layout.tsx` root kedua app. Komponen animasi juga memakai utilitas `motion-reduce` (mis. spinner PageState).

**Bukti**:
- `packages/ui/src/tokens.css:40-47` - `@media (prefers-reduced-motion: reduce) { … transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; … }`
- `apps/client-portal/src/app/globals.css:3` & `apps/owner-console/src/app/globals.css:3` - `@import '@chai/ui/tokens.css'` (call site produksi via `layout.tsx`)
- `packages/ui/src/page-state.tsx:24` - `animate-spin … motion-reduce:animate-none`

---

### REQ-04-021 - Accessibility component contract + critical keyboard patterns - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §12`): setiap komponen mendokumentasikan role/keyboard/focus/label/error/contrast/SR/reduced-motion; pola keyboard kritis: "inbox list: arrow navigation, Enter open; tabs: arrow keys; dialog: trapped focus and return; combobox: standard ARIA; table: navigable controls without making every cell a tab stop."

**Kondisi nyata**: Peran ARIA hadir di beberapa komponen (Modal `role=dialog`, Tabs `role=tab`/`aria-selected`, Dropdown `role=menu`), tetapi **pola keyboard yang diwajibkan tidak diimplementasikan** — sesuai aturan, ini SEBAGIAN, bukan TERPENUHI. Tidak ada `onKeyDown` di seluruh `packages/ui` (tabs tanpa arrow-key; dropdown tanpa navigasi keyboard) dan tidak ada `.focus()`/focus-trap (Modal tak menjebak/mengembalikan fokus). Daftar inbox adalah `<button>` (Tab+Enter jalan) tetapi tanpa navigasi panah. Combobox tidak ada.

**Bukti**:
- Perintah: `Select-String packages/ui/src -Pattern "onBlur|\.focus\(\)|focusTrap|trapFocus|onKeyDown"` → 0 hasil
- `packages/ui/src/tabs.tsx:26-40` - `role="tab"`/`aria-selected` + hanya `onClick` (tanpa arrow-key)
- `packages/ui/src/modal.tsx:26-46` - Escape ada, tetapi tanpa focus-trap/return
- `apps/client-portal/src/unified-inbox.tsx:272-289` - item queue = `<button>`, tanpa navigasi panah

**Yang kurang**: arrow-key pada tabs & inbox list, focus-trap+return pada dialog, ARIA combobox; dokumentasi kontrak a11y per komponen.

---

### REQ-04-022 - Design QA checklist (10 butir §13) - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §13`): 10 butir (token-only color/spacing; 320px flow; 200% zoom; kontras light; label panjang ID/EN; empty/loading/partial/stale/error didesain; owner/client dibedakan; risk/unofficial provider eksplisit; chart punya tabel/summary; komponen cocok kontrak izin/error API).

**Kondisi nyata**: Sebagian lulus, sebagian gagal, sebagian butuh runtime. **Lulus/terverifikasi statis**: owner vs client dibedakan visual (`app-shell.tsx` `surface` → sidebar gelap owner vs terang client); lebar min 320px (`tokens.css:18`); state empty/loading/error tersedia via PageState. **Gagal**: token-only color/spacing (D-2, palet mentah + nilai arbitrer); chart punya tabel alt (tak ada chart, REQ-04-017); komponen cocok kontrak izin API (nav tak sadar entitlement — lihat X-4 di `jalur-e-frontend.md`); risk/unofficial provider eksplisit (Community Gateway high-risk badge HILANG — REQ-03-011). **Butuh runtime**: 200% zoom & kontras light (tak dapat diputuskan statis).

**Bukti**:
- `packages/ui/src/app-shell.tsx:118-124` - `owner ? 'bg-slate-950 text-white' : 'bg-white'` (owner/client dibedakan)
- `packages/ui/src/tokens.css:18` - `min-width: 320px`
- `packages/ui/src/badge.tsx:11-25` - palet mentah (butir token-only gagal); Perintah: `Select-String apps/**/*.tsx -Pattern "<Chart"` → 0 hasil (butir chart-table gagal)

**Yang kurang**: token-only di komponen produk; alternatif tabel chart; nav sadar izin/entitlement; badge high-risk provider tak resmi; verifikasi runtime zoom 200% & kontras.

---

### REQ-04-023 - Uang minor-unit-safe di UI, server authoritative, tanpa float - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §14`): "Money never relies on floating-point UI calculations; server response remains authoritative." + "MoneyAmount: locale-aware amount/currency with minor-unit-safe input contract."

**Kondisi nyata**: `MoneyAmount` benar dan dirender di produksi — menerima integer minor units, menolak non-integer (`money-and-timeline.tsx:59`), memformat via `Intl.NumberFormat` dengan skala per mata uang (IDR/JPY = 0 desimal), dan dipakai di `payments/page.tsx:68`. Namun **jalur logistik owner melanggar** aturan: menghitung uang dengan pembagian float `c.amountCents / 100` — dan untuk IDR (tanpa minor unit) `/100` salah dua kali. Karena ada jalur benar (MoneyAmount) sekaligus jalur melanggar (float), kelasnya SEBAGIAN.

**Bukti**:
- `packages/ui/src/money-and-timeline.tsx:52-72` - MoneyAmount minor-unit-safe (integer guard `:59`, skala per-currency `:35-38`)
- `apps/client-portal/src/app/payments/page.tsx:68` - `<MoneyAmount amountMinor={payment.amount} currency={payment.currency} />` (jalur produksi benar)
- `apps/owner-console/src/app/logistics/page.tsx:129` - `(c.amountCents / 100).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })` (float + skala IDR salah)

**Yang kurang**: ganti `amountCents / 100` di logistics dengan `MoneyAmount`/`formatMoneyMinor` agar tak ada aritmetika float pada uang di UI.

---

### REQ-04-024 - Payment components wajib (6) - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §14`): 6 komponen — MoneyAmount; PaymentStatusBadge (status + event source + verified timestamp); PaymentTimeline (request/link/attempts/provider events/reconciliation); PaymentLinkSummary; ReconciliationBanner (stale/mismatch/uncertain + safe next action); RefundApprovalCard (amount/reason/eligibility/approvers/recent-auth/impact).

**Kondisi nyata**: Hanya **1 dari 6** yang ada & dirender: `MoneyAmount` (`payments/page.tsx:68`). Lima lainnya tidak ada; halaman payments memakai `StatusBadge` generik (tanpa event source/verified timestamp), tanpa PaymentTimeline, PaymentLinkSummary, ReconciliationBanner, maupun RefundApprovalCard.

**Bukti**:
- `apps/client-portal/src/app/payments/page.tsx:80` - `<StatusBadge …/>` generik, bukan `PaymentStatusBadge`
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "PaymentStatusBadge|PaymentTimeline|PaymentLinkSummary|ReconciliationBanner|RefundApprovalCard"` → 0 hasil

**Yang kurang**: PaymentStatusBadge (source+verified time), PaymentTimeline, PaymentLinkSummary, ReconciliationBanner, RefundApprovalCard (approver/recent-auth/impact).

---

### REQ-04-025 - Logistics components wajib (6) - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §14`): 6 komponen — ShipmentStatusBadge; TrackingTimeline (milestone time/source + fallback ordered-list aksesibel); EtaCommitment (provider/source/freshness, tanpa nilai bila tak tersedia); PackageItemSummary; ShipmentExceptionCard (severity/age/owner/next action); ProofOfDeliveryAccess (masked preview + permission + audit notice).

**Kondisi nyata**: Tidak satu pun dari 6 komponen bernama ada. Halaman shipments memakai `EventTimeline` generik (`shipments/page.tsx:67`) yang secara aksesibilitas berupa `<ol>` dengan waktu+deskripsi carrier (mendekati "TrackingTimeline dengan fallback ordered-list") — sebagai substitusi parsial, sehingga SEBAGIAN. Tidak ada ShipmentStatusBadge, EtaCommitment, PackageItemSummary, ShipmentExceptionCard, maupun ProofOfDeliveryAccess. Halaman logistics owner hanya tabel returns/claims (data kosong).

**Bukti**:
- `apps/client-portal/src/app/shipments/page.tsx:60-71` - `EventTimeline` (=`<ol>` di `money-and-timeline.tsx:112-133`) sebagai substitusi TrackingTimeline
- Perintah: `Select-String -Path apps/**,packages/** -Pattern "ShipmentStatusBadge|TrackingTimeline|EtaCommitment|PackageItemSummary|ShipmentExceptionCard|ProofOfDeliveryAccess"` → 0 hasil

**Yang kurang**: ShipmentStatusBadge, EtaCommitment(provider/freshness/no-value), PackageItemSummary, ShipmentExceptionCard(severity/age/owner), ProofOfDeliveryAccess(masked+permission+audit); TrackingTimeline bernama menggantikan timeline generik.

---

### REQ-04-026 - Never green Paid sebelum verified; Unknown/Stale/Mismatch first-class; source di sisi status eksternal - SEBAGIAN - MEDIUM

**Persyaratan** (`04_DESIGN_SYSTEM §14`): "Never use a green `Paid` state before verified provider evidence. … `Unknown`, `Stale`, and `Mismatch` are first-class states, not generic errors. Provider/source and last-updated time appear beside externally sourced status."

**Kondisi nyata**: Terpenuhi sebagian di shipments, dilanggar sebagian di payments. **Payments**: `statusTone` memetakan `PAID`→hijau (`success`) langsung dari string status API, tanpa state antara "Awaiting verification"; dan semua status selain PAID/PENDING dikategorikan `danger` — sehingga `UNKNOWN` jatuh ke merah generik, bukan state netral first-class. Status juga tak disertai provider/source maupun last-updated di sisinya. **Shipments** lebih baik: `STALE`→warning dan `UNKNOWN`→neutral dibedakan, dan `EventTimeline` menampilkan carrier (source) + `lastSyncedAt` (last-updated). Karena campur benar/salah, SEBAGIAN.

**Bukti**:
- `apps/client-portal/src/app/payments/page.tsx:17-21` - `statusTone`: `PAID`→`success` (hijau) langsung; selain PAID/PENDING → `danger` (UNKNOWN jadi merah, bukan first-class)
- `apps/client-portal/src/app/payments/page.tsx:76-81` - StatusBadge tanpa provider/source atau last-updated di sisinya
- `apps/client-portal/src/app/shipments/page.tsx:15-24,40-46` - `STALE`→warning, `UNKNOWN`→neutral dibedakan; carrier + `lastSyncedAt` ditampilkan

**Yang kurang**: state netral "Awaiting verification" sebelum bukti provider terverifikasi di payments; jadikan Unknown/Stale/Mismatch first-class (bukan `danger`); tampilkan provider/source + last-updated di sisi setiap status eksternal (payments).

---

## Self-check (§10.7)

1. **Dibaca penuh?** Ya — `04_DESIGN_SYSTEM.md` baris 1–399 (§1–§14). Tidak ada yang dilewati.
2. **REQ & distribusi kelas (26):** TERPENUHI 1 (REQ-04-020) · SEBAGIAN 23 · HILANG 2 (REQ-04-009, REQ-04-016) · BERTENTANGAN 0 · TIDAK-TERVERIFIKASI 0. (Satu koreksi kelas: REQ-04-015 HILANG→SEBAGIAN.)
3. **Setiap TERPENUHI ber-path:baris + call site?** Ya — REQ-04-020: `tokens.css:40-47` + call site `globals.css:3` (diimpor `layout.tsx` produksi) + `page-state.tsx:24`.
4. **Setiap HILANG ber-pencarian nol?** Ya — REQ-04-009 & REQ-04-016 menyertakan perintah `Select-String … → 0 hasil`.
5. **Sudah di-append ke berkas keluaran?** Ya — seluruh 26 blok ditulis ke `docs/audit/2026-07-29/jalur-e-frontend-04-bukti.md` (berkas ini).
6. **`git status --porcelain` hanya berkas `docs/audit/`?** Hanya berkas audit baru ini yang dibuat; tidak ada kode produksi disunting (audit read-only).

## Laporan (§10.8)

```
DOKUMEN 04 - 04_DESIGN_SYSTEM.md (399 baris)
REQ dihasilkan: 26 (REQ-04-001..026)
  TERPENUHI 1 | SEBAGIAN 23 | HILANG 2 | BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 0
Temuan severity tertinggi: REQ-04-010 (HIGH) - SecretInput tak ada; secret di-reveal via tombol salin + disimpan localStorage polos
Koreksi kelas: REQ-04-015 tabel HILANG -> SEBAGIAN (bubble inbound/outbound dirender di unified-inbox.tsx:298-305)
Berkas keluaran: docs/audit/2026-07-29/jalur-e-frontend-04-bukti.md
Self-check 6 butir: semua "ya"
```
