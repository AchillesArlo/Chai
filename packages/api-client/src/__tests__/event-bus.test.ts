import { describe, it, expect, afterEach, vi } from 'vitest';
import { apiEventBus } from '../event-bus';
import { ApiError } from '../errors';

describe('ApiEventBus', () => {
  afterEach(() => {
    apiEventBus.clear();
  });

  it('should subscribe to events', () => {
    const handler = vi.fn();
    const unsubscribe = apiEventBus.on('error', handler);

    expect(typeof unsubscribe).toBe('function');
  });

  it('should emit events to handlers', () => {
    const handler = vi.fn();
    apiEventBus.on('error', handler);

    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server error');
    apiEventBus.emit('error', error);

    expect(handler).toHaveBeenCalledWith(error);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support multiple handlers for same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    apiEventBus.on('error', handler1);
    apiEventBus.on('error', handler2);

    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server error');
    apiEventBus.emit('error', error);

    expect(handler1).toHaveBeenCalledWith(error);
    expect(handler2).toHaveBeenCalledWith(error);
  });

  it('should unsubscribe from events', () => {
    const handler = vi.fn();
    const unsubscribe = apiEventBus.on('error', handler);

    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server error');
    
    apiEventBus.emit('error', error);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    apiEventBus.emit('error', error);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  it('should handle auth-error events', () => {
    const handler = vi.fn();
    apiEventBus.on('auth-error', handler);

    const error = new ApiError(401, 'UNAUTHORIZED', 'Not authenticated');
    apiEventBus.emit('auth-error', error);

    expect(handler).toHaveBeenCalledWith(error);
  });

  it('should handle network-error events', () => {
    const handler = vi.fn();
    apiEventBus.on('network-error', handler);

    const error = new ApiError(0, 'NETWORK_ERROR', 'Network failed');
    apiEventBus.emit('network-error', error);

    expect(handler).toHaveBeenCalledWith(error);
  });

  it('should clear all listeners', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    apiEventBus.on('error', handler1);
    apiEventBus.on('auth-error', handler2);

    apiEventBus.clear();

    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server error');
    apiEventBus.emit('error', error);
    apiEventBus.emit('auth-error', error);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});
