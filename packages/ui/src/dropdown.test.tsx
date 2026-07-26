import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dropdown } from './dropdown';

describe('Dropdown', () => {
  const items = [
    { label: 'Edit', onClick: vi.fn() },
    { label: 'Delete', onClick: vi.fn() },
  ];

  it('does not show menu initially', () => {
    render(<Dropdown items={items} trigger={<span>Menu</span>} />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('shows menu on trigger click', () => {
    render(<Dropdown items={items} trigger={<span>Menu</span>} />);
    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByText('Edit')).toBeVisible();
    expect(screen.getByText('Delete')).toBeVisible();
  });

  it('calls item onClick and closes', () => {
    const editHandler = vi.fn();
    const deleteHandler = vi.fn();
    render(
      <Dropdown
        items={[
          { label: 'Edit', onClick: editHandler },
          { label: 'Delete', onClick: deleteHandler },
        ]}
        trigger={<span>Menu</span>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    fireEvent.click(screen.getByText('Edit'));

    expect(editHandler).toHaveBeenCalled();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('closes on outside click', () => {
    render(
      <div>
        <Dropdown items={items} trigger={<span>Menu</span>} />
        <button>Outside</button>
      </div>
    );

    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByText('Edit')).toBeVisible();

    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});
