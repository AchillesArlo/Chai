import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Form, required, email, minLength } from './form';

describe('Form', () => {
  it('renders fields and submit button', () => {
    render(
      <Form onSubmit={vi.fn()} submitLabel="Save">
        {({ field }) => (
          <>
            {field({ label: 'Name', name: 'name', rules: [required()] })}
            {field({ label: 'Email', name: 'email', type: 'email' })}
          </>
        )}
      </Form>
    );

    expect(screen.getByText('Name')).toBeVisible();
    expect(screen.getByText('Email')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('shows validation error for empty required field', async () => {
    render(
      <Form onSubmit={vi.fn()} submitLabel="Save">
        {({ field }) => field({ label: 'Name', name: 'name', rules: [required()] })}
      </Form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('This field is required')).toBeVisible();
    });
  });

  it('does not submit when validation fails', async () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit} submitLabel="Save">
        {({ field }) => field({ label: 'Name', name: 'name', rules: [required()] })}
      </Form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('This field is required')).toBeVisible();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with values when validation passes', async () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit} submitLabel="Save">
        {({ field }) => field({ label: 'Name', name: 'name', rules: [required()] })}
      </Form>
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: 'John' });
    });
  });

  it('validates email format', async () => {
    render(
      <Form onSubmit={vi.fn()} submitLabel="Save">
        {({ field }) => field({ label: 'Email', name: 'email', rules: [email()] })}
      </Form>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Must be a valid email')).toBeVisible();
    });
  });

  it('validates min length', async () => {
    render(
      <Form onSubmit={vi.fn()} submitLabel="Save">
        {({ field }) => field({ label: 'Password', name: 'password', rules: [minLength(8)] })}
      </Form>
    );

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Must be at least 8 characters')).toBeVisible();
    });
  });

  it('clears error when user types', async () => {
    render(
      <Form onSubmit={vi.fn()} submitLabel="Save">
        {({ field }) => field({ label: 'Name', name: 'name', rules: [required()] })}
      </Form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('This field is required')).toBeVisible());

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'J' } });
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument();
  });

  it('shows submitting state', async () => {
    const onSubmit = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    render(
      <Form onSubmit={onSubmit} submitLabel="Save">
        {({ field }) => field({ label: 'Name', name: 'name' })}
      </Form>
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    });
  });
});
