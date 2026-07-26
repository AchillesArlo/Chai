import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './modal';

describe('Modal', () => {
  it('does not render when closed', () => {
    render(
      <Modal onClose={vi.fn()} open={false}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(
      <Modal onClose={vi.fn()} open={true}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText('Modal content')).toBeVisible();
  });

  it('renders title and description', () => {
    render(
      <Modal description="Please confirm" onClose={vi.fn()} open={true} title="Confirm Action">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText('Confirm Action')).toBeVisible();
    expect(screen.getByText('Please confirm')).toBeVisible();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} open={true}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal onClose={onClose} open={true}>
        <p>Content</p>
      </Modal>
    );

    // Backdrop is the aria-hidden div
    const backdrop = container.querySelector('[aria-hidden="true"]');
    if (!backdrop) {
      throw new Error('Expected modal backdrop to be rendered');
    }
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} open={true}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders footer', () => {
    render(
      <Modal footer={<button>Confirm</button>} onClose={vi.fn()} open={true}>
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
  });
});
