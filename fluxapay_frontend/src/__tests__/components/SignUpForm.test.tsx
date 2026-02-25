/**
 * Component tests for SignUpForm
 */
/* eslint-disable @next/next/no-img-element */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignUpForm } from '@/features/auth';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all required fields', () => {
    render(<SignUpForm />);
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/business name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
    // password field
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('shows error when name is empty on submit', async () => {
    render(<SignUpForm />);
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      // "Name is required" matches first; use getAllByText to handle multiple matches
      const matches = screen.getAllByText(/name is required/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('shows error for missing business name', async () => {
    render(<SignUpForm />);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: 'John Doe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText(/business name is required/i)).toBeInTheDocument();
    });
  });
});
