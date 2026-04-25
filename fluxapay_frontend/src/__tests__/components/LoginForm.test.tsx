/**
 * Component tests for LoginForm
 */
/* eslint-disable @next/next/no-img-element */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginForm } from '@/features/auth';

// react-hot-toast and other common mocks are handled in setup.ts


describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email and password inputs', () => {
    render(<LoginForm />);
    expect(screen.getByPlaceholderText(/test@gmail.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^password$/i)).toBeInTheDocument();
  });

  it('shows validation error for empty email', async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid email', async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText(/test@gmail.com/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for short password', async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText(/test@gmail.com/i), {
      target: { value: 'test@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^password$/i), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => {
      expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument();
    });
  });
});

