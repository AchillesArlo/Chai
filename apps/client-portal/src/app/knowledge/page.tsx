'use client';

import { Upload, FileText } from 'lucide-react';
import { AppShell, MetricCard } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface KnowledgeDocumentItem {
  chunkIds: string[];
  id: string;
  knowledgeBaseId: string;
  text: string;
}

function excerpt(text: string, max = 120): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

export default function KnowledgePage() {
  const { data: documents, isLoading, error } = useApiQuery<KnowledgeDocumentItem[]>(
    ['knowledge', 'documents'],
    '/client/v1/knowledge/documents',
  );

  const rows = documents ?? [];
  const totalChunks = rows.reduce((sum, doc) => sum + doc.chunkIds.length, 0);
  const baseCount = new Set(rows.map((doc) => doc.knowledgeBaseId)).size;

  return (
    <AppShell
      currentPath="/knowledge"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="AI Knowledge Base (RAG)"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard freshness="live" label="Indexed Documents" value={isLoading ? '—' : String(rows.length)} />
          <MetricCard freshness="live" label="Total Knowledge Chunks" value={isLoading ? '—' : String(totalChunks)} />
          <MetricCard freshness="live" label="Knowledge Bases" value={isLoading ? '—' : String(baseCount)} />
        </div>

        {/* Upload Box */}
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <Upload className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-900">Upload PDF, DOCX, or TXT for RAG Indexing</p>
          <p className="mt-1 text-xs text-slate-500">Files are chunked, vectorized with OpenAI Embeddings, and stored in pgvector.</p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            Select Documents
          </button>
        </div>

        {/* Document Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-950">Indexed Documents</h2>
          </div>
          {isLoading ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">Loading documents…</div>
          ) : error ? (
            <div className="px-6 py-12 text-center text-sm text-red-600">Failed to load documents. {error.message}</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">No documents indexed yet.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {rows.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-5 w-5 shrink-0 text-brand-600" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{excerpt(doc.text)}</p>
                      <p className="text-xs text-slate-500">{doc.knowledgeBaseId} • {doc.chunkIds.length} vector chunks</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
