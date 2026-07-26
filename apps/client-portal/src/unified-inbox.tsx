'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, Plus, Search, Send, UserCheck, X } from 'lucide-react';
import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { useApiQuery, useInboxStream } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from './config/navigation';

export interface MessageItem {
  id: string;
  sender: 'customer' | 'agent' | 'ai';
  text: string;
  timestamp: string;
}

export interface ConversationRow {
  customer: string;
  id: string;
  lastMessage: string;
  messages: MessageItem[];
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED';
  priority: 'NORMAL' | 'URGENT';
  status: 'OPEN' | 'PENDING_AGENT' | 'RESOLVED';
}

// ponytail: backend ConversationSummary (apps/api/src/modules/channels) lacks customer/lastMessage/messages.
// Mapping partial until backend enriches the summary shape.
interface BackendConversation {
  id: string;
  contactId?: string;
  externalUserId?: string;
  provider?: string;
  mode?: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED';
  status?: 'OPEN' | 'PENDING_AGENT' | 'RESOLVED';
  assigneeUserId?: string;
  lastMessageAt?: string;
}

function toRow(c: BackendConversation): ConversationRow {
  return {
    customer: c.contactId ?? c.externalUserId ?? 'Unknown',
    id: c.id,
    lastMessage: c.lastMessageAt ? `Updated ${new Date(c.lastMessageAt).toLocaleTimeString()}` : 'No messages',
    messages: [],
    mode: c.mode ?? 'PAUSED',
    priority: 'NORMAL',
    status: c.status ?? 'OPEN',
  };
}

export function UnifiedInbox() {
  const pathname = usePathname();
  const { data: backendConversations, isLoading, error } = useApiQuery<BackendConversation[]>(
    ['conversations'],
    '/client/v1/conversations',
  );
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'PENDING_AGENT' | 'RESOLVED'>('ALL');
  const [newMessageText, setNewMessageText] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerMessage, setNewCustomerMessage] = useState('');

  useEffect(() => {
    if (backendConversations) {
      setConversations(backendConversations.map(toRow));
      if (!selectedId && backendConversations.length > 0) {
        const first = backendConversations[0];
        if (first) setSelectedId(first.id);
      }
    }
  }, [backendConversations]); // ponytail: selectedId omitted to avoid render loop

  useInboxStream({
    url: '/api/realtime/conversations',
    enabled: true,
    onEvent: (event) => {
      // ponytail: minimal merge until backend event shape exposes conversationId at top level.
      const id = (event.data as { conversationId?: string } | null)?.conversationId ?? `live-${Date.now()}`;
      setConversations((prev) => {
        if (prev.some((c) => c.id === id)) return prev;
        return [
          { customer: 'Live update', id, lastMessage: 'New activity', messages: [], mode: 'PAUSED', priority: 'NORMAL', status: 'OPEN' },
          ...prev,
        ];
      });
    },
  });

  const openCount = conversations.filter((c) => c.status === 'OPEN').length;
  const pendingCount = conversations.filter((c) => c.status === 'PENDING_AGENT').length;
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const filtered = conversations.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (searchQuery && !c.customer.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <AppShell
      currentPath={pathname}
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Inbox"
      surface="client"
      tenantContext="Demo Tenant"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard freshness="Live from API" label="Open conversations" value={String(openCount)} />
          <MetricCard freshness="Live from API" label="Awaiting human" value={String(pendingCount)} />
          <MetricCard freshness="Live from API" label="Total" value={String(conversations.length)} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section aria-labelledby="queue-title" className="lg:col-span-1">
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold text-slate-950" id="queue-title">
                  Conversation queue
                </h2>
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  <Plus className="size-3.5" /> New
                </button>
              </div>
              <div className="space-y-2 p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversationsâ€¦"
                    className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1">
                  {(['ALL', 'OPEN', 'PENDING_AGENT', 'RESOLVED'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setStatusFilter(f)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        statusFilter === f ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {f === 'PENDING_AGENT' ? 'Awaiting' : f}
                    </button>
                  ))}
                </div>
              </div>
              {isLoading ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">Loading conversationsâ€¦</div>
              ) : error ? (
                <div className="px-4 py-12 text-center text-sm text-red-600">Failed to load. {error.message}</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">No conversations.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 ${
                          selectedId === c.id ? 'bg-brand-50' : ''
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{c.customer}</p>
                          <p className="text-xs text-slate-500">{c.lastMessage}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge label={c.status} tone={c.status === 'OPEN' ? 'info' : c.status === 'RESOLVED' ? 'success' : 'warning'} />
                          {c.mode === 'AI_ACTIVE' && <MessageSquare className="size-3.5 text-brand-500" />}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="thread-title" className="lg:col-span-2">
            <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-950" id="thread-title">
                  {selected ? selected.customer : 'Select a conversation'}
                </h2>
              </div>
              {selected ? (
                <>
                  <div className="flex-1 space-y-4 overflow-y-auto p-6">
                    {selected.messages.length === 0 ? (
                      <p className="text-center text-sm text-slate-400">No message history yet.</p>
                    ) : (
                      selected.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-md rounded-lg px-3 py-2 text-sm ${
                              m.sender === 'customer' ? 'bg-slate-100 text-slate-900' : 'bg-brand-600 text-white'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                    }}
                    className="border-t border-slate-200 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        disabled
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        placeholder="Type a replyâ€¦"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <button
                        type="submit"
                        disabled
                        title="Replying isn't available yet: the API has no conversation reply endpoint."
                        className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="size-4" /> Send
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Replying isn&rsquo;t available yet &mdash; the conversation reply endpoint
                      hasn&rsquo;t been built in the API, so a message can&rsquo;t be sent from the
                      inbox. The action is disabled instead of clearing your text as if it were sent.
                    </p>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
                  Select a conversation from the list to view message history and reply.
                </div>
              )}
            </div>
          </section>
        </div>

        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-950">Create Conversation</h3>
                <button type="button" onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="size-5" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                }}
                className="space-y-3"
              >
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <textarea
                  value={newCustomerMessage}
                  onChange={(e) => setNewCustomerMessage(e.target.value)}
                  placeholder="Initial message"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500">
                  Starting a conversation from here isn&rsquo;t available yet &mdash; conversations
                  are created when a customer messages a connected channel, and the API exposes no
                  client endpoint to open one manually.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled
                    title="Starting a conversation from here isn't available yet: conversations are created when a customer messages a connected channel."
                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UserCheck className="size-4" /> Create Conversation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
