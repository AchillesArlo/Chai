'use client';

import { Plus, Tag } from 'lucide-react';
import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  price: string;
  stock: number;
  status: 'ACTIVE' | 'OUT_OF_STOCK';
}

const PRODUCTS_DATA: ProductItem[] = [
  { id: 'p-1', name: 'Paket Bleaching & Whitening Gigi', category: 'Perawatan', price: 'Rp 1.500.000', stock: 50, status: 'ACTIVE' },
  { id: 'p-2', name: 'Sikat Gigi Elektrik Sonic Pro', category: 'Produk Kebersihan', price: 'Rp 450.000', stock: 18, status: 'ACTIVE' },
  { id: 'p-3', name: 'Pasta Gigi Enzyme Extra Whitening', category: 'Produk Kebersihan', price: 'Rp 65.000', stock: 0, status: 'OUT_OF_STOCK' },
];

export default function CommercePage() {
  return (
    <AppShell
      currentPath="/commerce"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Commerce & Product Catalog"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard freshness="Active Products" label="Catalog Items" value="3 Products" />
          <MetricCard freshness="Midtrans Payment Link" label="Automated Checkout Links" value="Active" />
          <MetricCard freshness="Chat Commerce" label="Conversion Rate" trend="+3.4%" value="14.2%" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-950">Product & Service Catalog</h2>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>

          <ul className="divide-y divide-slate-200">
            {PRODUCTS_DATA.map((prod) => (
              <li key={prod.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 font-medium">
                    <Tag className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{prod.name}</p>
                    <p className="text-xs text-slate-500">{prod.category} • Stock: {prod.stock}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm font-bold text-slate-900">{prod.price}</p>
                  <StatusBadge label={prod.status} tone={prod.status === 'ACTIVE' ? 'success' : 'danger'} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
