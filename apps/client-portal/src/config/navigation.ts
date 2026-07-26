import {
  House,
  Inbox,
  BarChart3,
  Users,
  Target,
  BookOpen,
  Calendar,
  ShoppingBag,
  CreditCard,
  Truck,
  UserCheck,
  Settings,
} from 'lucide-react';

export const CLIENT_PORTAL_NAVIGATION = [
  { href: '/', icon: House, label: 'Beranda' },
  { href: '/inbox', icon: Inbox, label: 'Kotak Masuk (Inbox)' },
  { href: '/analytics', icon: BarChart3, label: 'Analitik & Laporan' },
  { href: '/customers', icon: Users, label: 'Pelanggan & Kontak' },
  { href: '/leads', icon: Target, label: 'Pipeline Prospek (Leads)' },
  { href: '/knowledge', icon: BookOpen, label: 'Basis Pengetahuan (AI RAG)' },
  { href: '/bookings', icon: Calendar, label: 'Jadwal & Reservasi' },
  { href: '/commerce', icon: ShoppingBag, label: 'Katalog & Produk' },
  { href: '/payments', icon: CreditCard, label: 'Pembayaran & Invoice' },
  { href: '/shipments', icon: Truck, label: 'Pengiriman & Ekspedisi' },
  { href: '/team', icon: UserCheck, label: 'Manajemen Tim' },
  { href: '/settings', icon: Settings, label: 'Pengaturan Kanal & Akun' },
];
