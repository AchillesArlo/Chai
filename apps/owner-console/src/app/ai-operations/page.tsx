'use client';

import { useState } from 'react';
import {
  Plus,
  Zap,
} from 'lucide-react';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

export interface LlmProviderItem {
  id: string;
  name: string;
  type: 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'OLLAMA';
  baseUrl: string;
  apiKeyMasked: string;
  status: 'ACTIVE' | 'STANDBY' | 'DISABLED';
  latency: string;
  modelsSupported: string[];
}

const INITIAL_LLM_PROVIDERS: LlmProviderItem[] = [
  {
    id: 'openrouter-aggregator',
    name: 'OpenRouter (Multi-Model Aggregator)',
    type: 'OPENROUTER',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyMasked: 'sk-or-v1-98a...3b21',
    status: 'ACTIVE',
    latency: '840ms',
    modelsSupported: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct'],
  },
  {
    id: 'openai-direct',
    name: 'OpenAI Direct API',
    type: 'OPENAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: 'sk-proj-78a...90ef',
    status: 'ACTIVE',
    latency: '1.2s',
    modelsSupported: ['gpt-4o', 'gpt-4o-mini', 'text-embedding-3-small'],
  },
  {
    id: 'anthropic-direct',
    name: 'Anthropic Claude Direct',
    type: 'ANTHROPIC',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyMasked: 'sk-ant-api03-12...34ab',
    status: 'STANDBY',
    latency: '1.1s',
    modelsSupported: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  },
];

export default function AiOperationsPage() {
  const [providers, setProviders] = useState<LlmProviderItem[]>(INITIAL_LLM_PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState<LlmProviderItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Provider State
  const [newType, setNewType] = useState<'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'OLLAMA'>('OPENROUTER');
  const [newName, setNewName] = useState('OpenRouter Aggregator');
  const [newBaseUrl, setNewBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [newApiKey, setNewApiKey] = useState('');
  const [savedToast, setSavedToast] = useState(false);

  const handleAddProvider = () => {
    if (!newApiKey) {
      alert('Please enter a valid API Key');
      return;
    }
    const item: LlmProviderItem = {
      id: `provider-${Date.now()}`,
      name: newName,
      type: newType,
      baseUrl: newBaseUrl,
      apiKeyMasked: `${newApiKey.substring(0, 8)}...${newApiKey.slice(-4)}`,
      status: 'ACTIVE',
      latency: '950ms',
      modelsSupported: newType === 'OPENROUTER' ? ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'] : ['default-model'],
    };

    setProviders([item, ...providers]);
    setShowAddModal(false);
    setNewApiKey('');
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  return (
    <AppShell
      currentPath="/ai-operations"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="AI Gateway & Provider Registry (OpenRouter / OpenAI / Anthropic)"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="space-y-6 max-w-6xl">
        {/* Toast Alert */}
        {savedToast && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs font-semibold text-emerald-800 shadow-sm animate-fade-in">
            <Zap className="size-4 text-emerald-600" />
            <span>New LLM Aggregator Provider configured successfully!</span>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <MetricCard freshness="Live LLM Gateway" label="Total Token Usage (Today)" value="1,450,200" />
          <MetricCard freshness="Cost Control" label="Estimated Cost (Today)" value="$14.50" />
          <MetricCard freshness="OpenRouter Gateway" label="Aggregator Status" value="ACTIVE" />
          <MetricCard freshness="Active Guardrails" label="Blocked Tool Invocations" value="0 Alerts" />
        </div>

        {/* Provider Registry Section */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">LLM Provider & Aggregator Registry</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure OpenAI-compatible aggregators (OpenRouter), direct LLM providers, or private Ollama instances.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="size-4" /> Add LLM Provider (OpenRouter / API Key)
            </button>
          </div>

          {/* Providers List */}
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-slate-950">{p.name}</span>
                    <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                      {p.type}
                    </span>
                    <StatusBadge label={p.status} tone={p.status === 'ACTIVE' ? 'success' : 'info'} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                    <span>Base URL: {p.baseUrl}</span>
                    <span>API Key: {p.apiKeyMasked}</span>
                    <span>Avg Latency: {p.latency}</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {p.modelsSupported.map((m) => (
                      <span key={m} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-mono text-slate-600">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedProvider(p)}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Manage Keys
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Logical Model Aliases */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-950">Logical Model Aliases & Fallback Routing</h3>
            <p className="text-xs text-slate-500">Map logical aliases used by AI tools to specific OpenRouter / OpenAI model endpoints</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-bold text-slate-900"><code>cs-fast</code> (FAQ & Routing)</p>
              <p className="text-slate-500 mt-1">OpenRouter: <code>anthropic/claude-3.5-haiku</code></p>
              <span className="mt-2 inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Low Latency & Fast</span>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-bold text-slate-900"><code>cs-quality</code> (Complex Service)</p>
              <p className="text-slate-500 mt-1">OpenRouter: <code>openai/gpt-4o</code></p>
              <span className="mt-2 inline-block text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">High Reasoning Precision</span>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-bold text-slate-900"><code>lead-extractor</code> (Structured JSON)</p>
              <p className="text-slate-500 mt-1">OpenRouter: <code>deepseek/deepseek-r1</code></p>
              <span className="mt-2 inline-block text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">Strict JSON Schema Output</span>
            </div>
          </div>
        </div>

        {/* Modal Add Provider */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-semibold text-slate-950">Add LLM Aggregator / Provider API Key</h3>
                <button onClick={() => setShowAddModal(false)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700">Provider Type</label>
                  <select
                    value={newType}
                    onChange={(e) => {
                      const val = e.target.value as typeof newType;
                      setNewType(val);
                      if (val === 'OPENROUTER') {
                        setNewName('OpenRouter Aggregator');
                        setNewBaseUrl('https://openrouter.ai/api/v1');
                      } else if (val === 'OPENAI') {
                        setNewName('OpenAI Direct');
                        setNewBaseUrl('https://api.openai.com/v1');
                      } else if (val === 'ANTHROPIC') {
                        setNewName('Anthropic Direct');
                        setNewBaseUrl('https://api.anthropic.com/v1');
                      } else if (val === 'OLLAMA') {
                        setNewName('Ollama Private Instance');
                        setNewBaseUrl('http://localhost:11434/v1');
                      }
                    }}
                    className="mt-1 w-full rounded border p-2 font-medium"
                  >
                    <option value="OPENROUTER">OpenRouter (Multi-Model Aggregator)</option>
                    <option value="OPENAI">OpenAI Direct</option>
                    <option value="ANTHROPIC">Anthropic Direct</option>
                    <option value="OLLAMA">Ollama / OpenAI-Compatible Private Server</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">Provider / Registry Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 w-full rounded border p-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">Base Endpoint URL</label>
                  <input
                    type="text"
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    className="mt-1 w-full rounded border p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">API Key (e.g. sk-or-v1-...)</label>
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="sk-or-v1-xxxxxxxx..."
                    className="mt-1 w-full rounded border p-2 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => setShowAddModal(false)} className="rounded border px-4 py-2 text-xs">Cancel</button>
                <button onClick={handleAddProvider} className="rounded bg-brand-600 px-4 py-2 text-xs text-white font-semibold hover:bg-brand-700">
                  Save Provider Key
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Manage Provider */}
        {selectedProvider && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-semibold text-slate-950">Manage {selectedProvider.name}</h3>
                <button onClick={() => setSelectedProvider(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700">Masked Key</label>
                  <input type="text" readOnly value={selectedProvider.apiKeyMasked} className="mt-1 w-full rounded border bg-slate-50 p-2 font-mono" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Base URL</label>
                  <input type="text" readOnly value={selectedProvider.baseUrl} className="mt-1 w-full rounded border bg-slate-50 p-2 font-mono" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Supported Models</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedProvider.modelsSupported.map((m) => (
                      <span key={m} className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-700">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => setSelectedProvider(null)} className="rounded bg-slate-900 px-4 py-2 text-xs text-white font-semibold">
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
