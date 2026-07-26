'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Copy,
  Globe,
  Key,
  MessageSquare,
  Save,
  Send,
  Smartphone,
  Sliders,
} from 'lucide-react';

import { AppShell, StatusBadge } from '@chai/ui';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'channels' | 'api' | 'guardrails'>('channels');

  // Form states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedWidget, setCopiedWidget] = useState(false);
  const [savedAlert, setSavedAlert] = useState(false);

  // Persistent settings state
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('1092837482910');
  const [waWbaid, setWaWbaid] = useState('8920192837192');
  const [waAccessToken, setWaAccessToken] = useState('EAAG...meta_live_access_token');
  const [telegramToken, setTelegramToken] = useState('71829381:AAHk-9f8231jksd98123');
  const [webhookUrl, setWebhookUrl] = useState('https://api.nusantaradental.id/webhooks/chai-events');

  // Company Profile state
  const [companyName, setCompanyName] = useState('Nusantara Dental');
  const [industry, setIndustry] = useState('HEALTHCARE');
  const [timezone, setTimezone] = useState('Asia/Jakarta');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('chai_client_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.waPhoneNumberId) setWaPhoneNumberId(parsed.waPhoneNumberId);
        if (parsed.waWbaid) setWaWbaid(parsed.waWbaid);
        if (parsed.waAccessToken) setWaAccessToken(parsed.waAccessToken);
        if (parsed.telegramToken) setTelegramToken(parsed.telegramToken);
        if (parsed.webhookUrl) setWebhookUrl(parsed.webhookUrl);
        if (parsed.companyName) setCompanyName(parsed.companyName);
        if (parsed.industry) setIndustry(parsed.industry);
        if (parsed.timezone) setTimezone(parsed.timezone);
      }
    } catch {
      // Ignore JSON parse error
    }
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveSettings = () => {
    const payload = {
      waPhoneNumberId,
      waWbaid,
      waAccessToken,
      telegramToken,
      webhookUrl,
      companyName,
      industry,
      timezone,
    };
    try {
      localStorage.setItem('chai_client_settings', JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 3000);
  };

  return (
    <AppShell
      currentPath="/settings"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Pengaturan Kanal & Perusahaan"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <div className="space-y-6 max-w-5xl">
        {/* Toast Alert */}
        {savedAlert && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs font-semibold text-emerald-800 shadow-sm animate-fade-in">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>Pengaturan kanal dan kredensial perusahaan berhasil disimpan!</span>
          </div>
        )}

        {/* Settings Navigation Tabs */}
        <div className="flex border-b border-slate-200 space-x-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            onClick={() => setActiveTab('channels')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'channels'
                ? 'border-brand-600 text-brand-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Smartphone className="size-4" />
            <span>Kanal Terhubung (WhatsApp / Meta / Web Widget)</span>
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'api'
                ? 'border-brand-600 text-brand-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Key className="size-4" />
            <span>Kunci API & Webhook Outbound</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-brand-600 text-brand-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Globe className="size-4" />
            <span>Profil Perusahaan & Jam Kerja</span>
          </button>
          <button
            onClick={() => setActiveTab('guardrails')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'guardrails'
                ? 'border-brand-600 text-brand-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Sliders className="size-4" />
            <span>Pembatas AI (Guardrails) & SLA</span>
          </button>
        </div>

        {/* Tab 1: Connected Channels */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            {/* Meta WhatsApp Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                    <MessageSquare className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-950">WhatsApp Business API (Meta Cloud API)</h3>
                    <p className="text-xs text-slate-500">Integrasi resmi Meta Graph API v20.0 untuk WhatsApp Business</p>
                  </div>
                </div>
                <StatusBadge label="AKTIF" tone="success" />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Phone Number ID (Meta)</label>
                    <input
                      type="text"
                      value={waPhoneNumberId}
                      onChange={(e) => setWaPhoneNumberId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">WhatsApp Business Account ID (WBAID)</label>
                    <input
                      type="text"
                      value={waWbaid}
                      onChange={(e) => setWaWbaid(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">System User Permanent Access Token</label>
                  <input
                    type="password"
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>

                {/* Embedded Signup CTA */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-emerald-950">Otentikasi Login Meta Embedded Signup</p>
                    <p className="text-[11px] text-emerald-700">Hubungkan nomor WhatsApp Business Anda secara langsung via Meta OAuth Dialog</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSettings()}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Hubungkan via Login Meta Resmi
                  </button>
                </div>

                {/* Platform Webhook Config */}
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <span className="text-xs font-semibold text-slate-900 block">Konfigurasi Webhook Receiver Platform</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Callback URL (Tempel di Meta Console):</span>
                      <code className="font-mono text-slate-800 bg-white p-1 rounded border block truncate">
                        http://localhost:3001/api/v1/channels/whatsapp/webhook
                      </code>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Verify Token:</span>
                      <code className="font-mono text-slate-800 bg-white p-1 rounded border block">
                        chai_wa_verify_token_2026
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Telegram Bot Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    <Send className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Telegram Bot API</h3>
                    <p className="text-xs text-slate-500">Hubungkan Bot Telegram untuk pesan instan dan notifikasi pelanggan</p>
                  </div>
                </div>
                <StatusBadge label="AKTIF" tone="success" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Username Bot Telegram</label>
                  <input
                    type="text"
                    defaultValue="@NusantaraDentalBot"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Bot HTTP API Token (@BotFather)</label>
                  <input
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Web Chat Widget Embed Snippet */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Code2 className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Widget Live Chat Website (Embed Script)</h3>
                    <p className="text-xs text-slate-500">Tempelkan kode skrip widget live chat ini ke dalam HTML / React website Anda</p>
                  </div>
                </div>
                <StatusBadge label="AKTIF" tone="success" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Kode Skrip Embed HTML</label>
                <div className="relative">
                  <pre className="rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-emerald-400 overflow-x-auto">
                    {`<script 
  src="http://localhost:3001/widget/v1/chai-widget.js" 
  data-tenant-id="tenant-nusantara-dental"
  data-color="#0284c7"
  async>
</script>`}
                  </pre>
                  <button
                    onClick={() => {
                      copyToClipboard(
                        `<script src="http://localhost:3001/widget/v1/chai-widget.js" data-tenant-id="tenant-nusantara-dental" async></script>`,
                        'widget'
                      );
                      setCopiedWidget(true);
                      setTimeout(() => setCopiedWidget(false), 2000);
                    }}
                    className="absolute top-3 right-3 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 flex items-center gap-1"
                  >
                    <Copy className="size-3" />
                    <span>{copiedWidget ? 'Tersalin!' : 'Salin Skrip'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
              >
                <Save className="size-4" /> Simpan Pengaturan Kanal
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: API Keys & Webhooks */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-950">Kunci API Platform Klien</h3>
                <p className="text-xs text-slate-500">Gunakan kunci API ini untuk mengakses GraphQL & REST API resmi platform</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">URL Dasar REST API Platform</label>
                  <input
                    type="text"
                    readOnly
                    value="http://localhost:3001/api/v1"
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">Kunci Rahasia Client Secret (Outbound API)</label>
                    <button
                      onClick={() => copyToClipboard('chai_sec_live_98a7b6c5d4e3f210', 'secret')}
                      className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"
                    >
                      <Copy className="size-3" /> {copiedKey === 'secret' ? 'Tersalin!' : 'Salin Kunci Rahasia'}
                    </button>
                  </div>
                  <input
                    type="password"
                    readOnly
                    value="chai_sec_live_98a7b6c5d4e3f210"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">Kunci Publik Widget (Publishable Public Key)</label>
                    <button
                      onClick={() => copyToClipboard('chai_pub_live_1234567890abcdef', 'public')}
                      className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"
                    >
                      <Copy className="size-3" /> {copiedKey === 'public' ? 'Tersalin!' : 'Salin Kunci Publik'}
                    </button>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value="chai_pub_live_1234567890abcdef"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Outbound Webhooks */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-950">Webhook Outbound Klien</h3>
                <p className="text-xs text-slate-500">Kirim event real-time (Pesan baru, Lead baru, Booking dibuat) ke server internal Anda</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">URL Server Webhook Anda</label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://perusahaan.id/webhooks/receiver"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Langganan Event Event Subscriptions</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 rounded border p-2 bg-slate-50">
                      <input type="checkbox" defaultChecked className="rounded text-brand-600" />
                      <span>conversation.message_received</span>
                    </label>
                    <label className="flex items-center gap-2 rounded border p-2 bg-slate-50">
                      <input type="checkbox" defaultChecked className="rounded text-brand-600" />
                      <span>lead.created</span>
                    </label>
                    <label className="flex items-center gap-2 rounded border p-2 bg-slate-50">
                      <input type="checkbox" defaultChecked className="rounded text-brand-600" />
                      <span>booking.created</span>
                    </label>
                    <label className="flex items-center gap-2 rounded border p-2 bg-slate-50">
                      <input type="checkbox" defaultChecked className="rounded text-brand-600" />
                      <span>payment.settled</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => handleSaveSettings()}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Kirim Uji Coba Ping Webhook
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition"
                >
                  <Save className="size-4" /> Simpan Pengaturan API
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Tenant Profile */}
        {activeTab === 'profile' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-950">Profil Perusahaan & Isolasi Workspace</h3>
              <p className="text-xs text-slate-500">Informasi identitas perusahaan dan pengaturan zona waktu operasional</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nama Perusahaan / Workspace</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-medium focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">ID Klien Terisolasi (Tenant ID)</label>
                <input
                  type="text"
                  readOnly
                  value="tenant-nusantara-dental"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Kategori Industri</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-medium focus:border-brand-500 focus:outline-none"
                >
                  <option value="HEALTHCARE">Kesehatan & Klinik Gigi</option>
                  <option value="LOGISTICS">Logistik & Ekspedisi</option>
                  <option value="COMMERCE">E-Commerce & Ritel</option>
                  <option value="SERVICES">Jasa Konsultasi / Profesional</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Zona Waktu Operasional</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-medium focus:border-brand-500 focus:outline-none"
                >
                  <option value="Asia/Jakarta">WIB - Asia/Jakarta (GMT+7)</option>
                  <option value="Asia/Makassar">WITA - Asia/Makassar (GMT+8)</option>
                  <option value="Asia/Jayapura">WIT - Asia/Jayapura (GMT+9)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
              >
                <Save className="size-4" /> Simpan Profil Perusahaan
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: AI Guardrails */}
        {activeTab === 'guardrails' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-950">Aturan & Pembatas AI CS (Guardrails & Human SLA)</h3>
              <p className="text-xs text-slate-500">Konfigurasi batas otomatisasi balasan bot AI dan penanganan ke CS Manusia</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between rounded-lg border p-4 bg-slate-50">
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-900 block">Eskalasi Otomatis ke Agen Manusia (Frustration Handover)</span>
                  <span className="text-slate-500 text-[11px]">Otomatis alihkan chat ke CS Manusia jika pelanggan terdeteksi frustrasi atau meminta bicara dengan staf</span>
                </div>
                <input type="checkbox" defaultChecked className="size-4 rounded text-brand-600" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4 bg-slate-50">
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-900 block">Sensor & Perlindungan Data Pribadi (PII Masking)</span>
                  <span className="text-slate-500 text-[11px]">Sensor otomatis nomor KTP, nomor rekening, dan kata sandi sebelum dikirim ke LLM</span>
                </div>
                <input type="checkbox" defaultChecked className="size-4 rounded text-brand-600" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4 bg-slate-50">
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-900 block">Batas Waktu Jendela Balas WhatsApp 24 Jam</span>
                  <span className="text-slate-500 text-[11px]">Peringatkan CS jika pesan masuk sudah mendekati batas 24 jam kebijakan Meta</span>
                </div>
                <input type="checkbox" defaultChecked className="size-4 rounded text-brand-600" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
              >
                <Save className="size-4" /> Simpan Aturan AI
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
