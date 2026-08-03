import {
  LayoutDashboard,
  Building2,
  Activity,
  MessageSquare,
  Cpu,
  Workflow,
  Store,
  Palette,
  Truck,
  DollarSign,
  ShieldCheck,
  Settings,
} from 'lucide-react';

export const OWNER_CONSOLE_NAVIGATION = [
  { href: '/', icon: LayoutDashboard, label: 'Ikhtisar Platform' },
  { href: '/tenants', icon: Building2, label: 'Direktori Klien (Tenant)' },
  { href: '/reliability', icon: Activity, label: 'Keandalan Server & SLA' },
  { href: '/channel-health', icon: MessageSquare, label: 'Kesehatan Kanal' },
  { href: '/ai-operations', icon: Cpu, label: 'Operasional AI & Model' },
  { href: '/automation', icon: Workflow, label: 'Otomatisasi & Webhook' },
  { href: '/marketplace', icon: Store, label: 'Konektor & Sakelar Darurat' },
  { href: '/whitelabel', icon: Palette, label: 'Merek & Domain Kustom' },
  { href: '/logistics', icon: Truck, label: 'Logistik & Kurir Global' },
  { href: '/billing', icon: DollarSign, label: 'Penggunaan & Tagihan' },
  { href: '/audit', icon: ShieldCheck, label: 'Log Audit & Keamanan' },
  { href: '/settings', icon: Settings, label: 'Pengaturan Sistem' },
];
