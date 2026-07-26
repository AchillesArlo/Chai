'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface WebhookSubscription {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: string;
  createdAt: string;
}

const COMMON_EVENTS = [
  'order.created',
  'order.updated',
  'order.completed',
  'payment.created',
  'payment.completed',
  'payment.failed',
  'customer.created',
  'customer.updated',
  'automation.triggered',
  'automation.completed',
];

function WebhookFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const webhookId = searchParams.get('id');
  const isEditing = !!webhookId;

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [status, setStatus] = useState('ACTIVE');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const tenantId = 'demo-tenant-id'; // TODO: get from auth context

  useEffect(() => {
    if (webhookId) {
      setLoading(true);
      fetch(`/api/v1/marketplace/webhooks/${webhookId}?tenantId=${tenantId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: WebhookSubscription | null) => {
          if (data) {
            setUrl(data.url);
            setDescription(data.description ?? '');
            setSelectedEvents(data.events);
            setStatus(data.status);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [webhookId]);

  const handleEventToggle = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      url,
      description: description || undefined,
      events: selectedEvents,
      status,
    };

    try {
      const endpoint = isEditing
        ? `/api/v1/marketplace/webhooks/${webhookId}?tenantId=${tenantId}`
        : `/api/v1/marketplace/webhooks?tenantId=${tenantId}`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push('/marketplace');
      }
    } catch (error) {
      console.error('Failed to save webhook:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading webhook…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {isEditing ? 'Edit Webhook' : 'New Webhook Subscription'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure a webhook endpoint to receive platform events.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* URL */}
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            Webhook URL
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://example.com/webhook"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description (optional)
          </label>
          <input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Production webhook endpoint"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Events */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Events to subscribe
          </label>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_EVENTS.map((event) => (
              <label key={event} className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(event)}
                  onChange={() => handleEventToggle(event)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-gray-700">{event}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Leave empty to receive all events.
          </p>
        </div>

        {/* Status */}
        {isEditing && (
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={() => router.push('/marketplace')}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !url}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : isEditing ? 'Update Webhook' : 'Create Webhook'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function WebhookFormPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading webhook…</div>}>
      <WebhookFormContent />
    </Suspense>
  );
}
