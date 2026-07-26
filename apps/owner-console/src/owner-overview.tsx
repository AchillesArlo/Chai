'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  MessageSquare,
  Power,
  RefreshCw,
  Shield,
  ShieldAlert,
} from 'lucide-react';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from './config/navigation';

export interface TenantRiskItem {
  id: string;
  name: string;
  slug: string;
  plan: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  activeChannels: number;
  waQuotaUsed: number;
  aiLatencyMs: number;
  riskStatus: 'NORMAL' | 'WARNING' | 'CRITICAL';
  riskMessage?: string;
  monthlySpend: string;
}

const MOCK_TENANTS_DATA: Record<string, TenantRiskItem> = {
  'Nusantara Dental': {
    id: 'tenant-nusantara',
    name: 'Nusantara Dental',
    slug: 'nusantara-dental',
    plan: 'ENTERPRISE',
    activeChannels: 3,
    waQuotaUsed: 62,
    aiLatencyMs: 420,
    riskStatus: 'NORMAL',
    monthlySpend: 'Rp 7.500.000 / bln',
  },
  'Surya Logistics': {
    id: 'tenant-surya',
    name: 'Surya Logistics',
    slug: 'surya-logistics',
    plan: 'GROWTH',
    activeChannels: 2,
    waQuotaUsed: 88,
    aiLatencyMs: 980,
    riskStatus: 'WARNING',
    riskMessage: 'Penundaan antrean antarmuka Webhook (>45 detik)',
    monthlySpend: 'Rp 3.750.000 / bln',
  },
  'Acme Healthcare': {
    id: 'tenant-acme',
    name: 'Acme Healthcare',
    slug: 'acme-healthcare',
    plan: 'ENTERPRISE',
    activeChannels: 4,
    waQuotaUsed: 94,
    aiLatencyMs: 1450,
    riskStatus: 'CRITICAL',
    riskMessage: 'Batas kuota harian WhatsApp Cloud API Meta mencapai 94%',
    monthlySpend: 'Rp 7.500.000 / bln',
  },
};

const ALL_RISK_ITEMS: TenantRiskItem[] = Object.values(MOCK_TENANTS_DATA);

export function OwnerOverview() {
  const [selectedTenant, setSelectedTenant] = useState<string>('All tenants');
  const [tenantsData, setTenantsData] = useState<TenantRiskItem[]>(ALL_RISK_ITEMS);
  const [aiCircuitBreaker, setAiCircuitBreaker] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleResolveRisk = (tenantId: string) => {
    setTenantsData((prev) =>
      prev.map((t) => (t.id === tenantId ? { ...t, riskStatus: 'NORMAL', riskMessage: undefined } : t))
    );
    showNotification(`Peringatan risiko untuk klien telah diselesaikan.`);
  };

  const isAllTenants = selectedTenant === 'All tenants';
  const tenantDetails = !isAllTenants ? MOCK_TENANTS_DATA[selectedTenant] || {
    id: `tenant-${selectedTenant.toLowerCase()}`,
    name: selectedTenant,
    slug: selectedTenant.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    plan: 'GROWTH',
    activeChannels: 2,
    waQuotaUsed: 45,
    aiLatencyMs: 510,
    riskStatus: 'NORMAL',
    monthlySpend: 'Rp 3.750.000 / bln',
  } : null;

  return (
    <AppShell
      currentPath="/"
      navigation={OWNER_CONSOLE_NAVIGATION}
      onTenantChange={(t) => setSelectedTenant(t)}
      pageTitle={isAllTenants ? 'Ikhtisar Platform Global' : `Pusat Kendali Klien: ${selectedTenant}`}
      surface="owner"
      tenantContext={selectedTenant}
    >
      <div className="space-y-6 max-w-6xl">
        {/* Notification Banner */}
        {toastMessage && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs font-semibold text-emerald-800 shadow-sm animate-fade-in">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Global vs Scoped Banner */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-brand-600" />
              <h2 className="text-base font-bold text-slate-950">
                {isAllTenants ? 'Pusat Kontrol Global Seluruh Klien (Tenant)' : `Konteks Klien Aktif: ${selectedTenant}`}
              </h2>
              <StatusBadge
                label={isAllTenants ? 'MODE AUDIT GLOBAL' : `PAKET ${tenantDetails?.plan || 'ENTERPRISE'}`}
                tone={isAllTenants ? 'info' : 'success'}
              />
            </div>
            <p className="text-xs text-slate-600 max-w-2xl">
              {isAllTenants
                ? 'Memantau statistik agregat kesehatan platform, metrik klien aktif, pemakaian token AI, dan sakelar darurat.'
                : `Anda sedang menginspeksi batas isolasi khusus untuk "${selectedTenant}". Setiap tindakan dicatat dalam Log Audit resmi.`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isAllTenants && (
              <button
                onClick={() => setSelectedTenant('All tenants')}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw className="size-3.5" /> Kembali ke Semua Klien
              </button>
            )}
            <button
              onClick={() => {
                setAiCircuitBreaker((prev) => !prev);
                showNotification(aiCircuitBreaker ? 'AI Circuit Breaker DINONAKTIFKAN.' : 'Sakelar Darurat AI Klien DIAKTIFKAN!');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                aiCircuitBreaker ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <Power className="size-3.5" />
              {aiCircuitBreaker ? 'AI Klien Dihentikan (Paused)' : 'Hentikan Sementara AI Klien'}
            </button>
          </div>
        </div>

        {/* Critical Alert Rail */}
        <section aria-labelledby="alert-rail-title" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight text-slate-950 flex items-center gap-2" id="alert-rail-title">
              <ShieldAlert className="size-4 text-amber-500" /> Ringkasan Keandalan & Peringatan Sistem
            </h3>
            <StatusBadge
              label={
                tenantsData.some((t) => t.riskStatus === 'CRITICAL')
                  ? 'TERDETEKSI EVENT KRITIS'
                  : tenantsData.some((t) => t.riskStatus === 'WARNING')
                  ? 'PERINGATAN PENURUNAN KINERJA'
                  : 'SISTEM NORMAL TANPA GANGGUAN'
              }
              tone={
                tenantsData.some((t) => t.riskStatus === 'CRITICAL')
                  ? 'danger'
                  : tenantsData.some((t) => t.riskStatus === 'WARNING')
                  ? 'warning'
                  : 'success'
              }
            />
          </div>
        </section>

        {/* Dynamic Metric Cards */}
        {isAllTenants ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard freshness="Diperbarui 1 menit lalu" label="Total Klien Aktif" trend="+2 minggu ini" value="14" />
            <MetricCard freshness="Target SLA 99.9%" label="Kesehatan Platform" value="99.9%" />
            <MetricCard freshness="Antrean Insiden Klien" label="Insiden Perlu Tindakan" value={tenantsData.filter((t) => t.riskStatus !== 'NORMAL').length.toString()} />
            <MetricCard freshness="Konektor Cloud API Meta" label="Koneksi WhatsApp" value="NORMAL" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard freshness="Periode Kuota 24 Jam" label="Kuota Pesan WhatsApp" value={`${tenantDetails?.waQuotaUsed}% Terpakai`} />
            <MetricCard freshness="Respon Rata-rata AI" label="Latensi AI Gateway" value={`${tenantDetails?.aiLatencyMs} ms`} />
            <MetricCard freshness="WhatsApp + Telegram + Web" label="Kanal Komunikasi Terhubung" value={`${tenantDetails?.activeChannels} Kanal`} />
            <MetricCard freshness="Tagihan Langganan Klien" label="Paket & Biaya" value={tenantDetails?.monthlySpend || 'Rp 3.750.000 / bln'} />
          </div>
        )}

        {/* Scoped Tenant Control Panel or Global Tenant Directory */}
        {!isAllTenants && tenantDetails ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-950">Profil Teknis Klien: {tenantDetails.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">ID Klien: {tenantDetails.id} • Slug: /{tenantDetails.slug}</p>
              </div>
              <StatusBadge
                label={tenantDetails.riskStatus === 'NORMAL' ? 'NORMAL' : tenantDetails.riskStatus}
                tone={tenantDetails.riskStatus === 'CRITICAL' ? 'danger' : tenantDetails.riskStatus === 'WARNING' ? 'warning' : 'success'}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <MessageSquare className="size-4 text-brand-600" /> WhatsApp & Kanal Komunikasi
                </div>
                <p className="text-xs text-slate-600">Meta Cloud API Direct (Aktif)</p>
                <p className="text-[11px] text-slate-500">ID Nomor Telepon: 1092837482910</p>
                <button
                  onClick={() => showNotification(`Ping uji coba berhasil dikirim ke Webhook WhatsApp ${tenantDetails.name}.`)}
                  className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
                >
                  Uji Coba Ping Webhook →
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Bot className="size-4 text-purple-600" /> Aturan & Pembatas AI CS
                </div>
                <p className="text-xs text-slate-600">Eskalasi ke Agen Manusia: AKTIF</p>
                <p className="text-[11px] text-slate-500">Sensor Data Pribadi (PII): AKTIF</p>
                <button
                  onClick={() => showNotification(`Pengaturan pembatas AI terverifikasi untuk ${tenantDetails.name}.`)}
                  className="mt-2 text-xs font-semibold text-purple-600 hover:underline"
                >
                  Atur Pembatas AI →
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Shield className="size-4 text-emerald-600" /> Keamanan Data & Isolasi
                </div>
                <p className="text-xs text-slate-600">Batas Isolasi Database (RLS): KETAT</p>
                <p className="text-[11px] text-slate-500">Kunci Enkripsi KMS: AKTIF</p>
                <button
                  onClick={() => showNotification(`Log audit difilter khusus untuk ${tenantDetails.name}.`)}
                  className="mt-2 text-xs font-semibold text-emerald-600 hover:underline"
                >
                  Lihat Log Audit Klien →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Antrean Pemantauan Risiko & Kesehatan Klien (Tenant)</h3>
                <p className="text-xs text-slate-500">
                  Pemantauan otomatis untuk klien yang hampir mencapai batas kuota WhatsApp atau mengalami penurunan respon webhook.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{tenantsData.length} Klien Terdaftar</span>
            </div>

            <div className="space-y-3">
              {tenantsData.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-slate-950">{t.name}</span>
                      <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        PAKET {t.plan}
                      </span>
                      <StatusBadge
                        label={t.riskStatus === 'NORMAL' ? 'NORMAL' : t.riskStatus}
                        tone={t.riskStatus === 'CRITICAL' ? 'danger' : t.riskStatus === 'WARNING' ? 'warning' : 'success'}
                      />
                    </div>
                    {t.riskMessage && (
                      <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                        <AlertTriangle className="size-3.5 shrink-0" /> {t.riskMessage}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                      <span>Kanal Aktif: {t.activeChannels}</span>
                      <span>Kuota WA: {t.waQuotaUsed}%</span>
                      <span>Latensi AI: {t.aiLatencyMs}ms</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.riskStatus !== 'NORMAL' && (
                      <button
                        onClick={() => handleResolveRisk(t.id)}
                        className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        Selesaikan Peringatan
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedTenant(t.name)}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      Inspeksi Klien <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function OwnerLoginPanel({
  localAccessEnabled = false,
}: {
  localAccessEnabled?: boolean;
}) {
  return (
    <section className="mx-auto max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight text-slate-950">
        Login Pemilik Platform (Founder)
      </h1>
      <p className="text-sm text-slate-600">
        Halaman khusus pengelola platform dengan otentikasi MFA dan otorisasi aman.
      </p>
      {localAccessEnabled ? (
        <button
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          type="button"
        >
          Gunakan Identitas Founder Lokal
        </button>
      ) : null}
    </section>
  );
}
