/**
 * Component tests for SignUpForm
 */
/* eslint-disable @next/next/no-img-element */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignUpForm } from '@/features/auth';

// Common mocks handled in setup.tsx

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all required fields', () => {
    render(<SignUpForm />);
    expect(screen.getByPlaceholderText(/fullNamePlaceholder/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/businessNamePlaceholder/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/emailSignupPlaceholder/i)).toBeInTheDocument();
    // password field
    expect(screen.getByPlaceholderText(/passwordPlaceholder/i)).toBeInTheDocument();
  });

  it('shows error when name is empty on submit', async () => {
    render(<SignUpForm />);
    fireEvent.click(screen.getByRole('button', { name: /signup/i }));
    await waitFor(() => {
      const matches = screen.getAllByText(/validation.nameRequired/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('shows error for missing business name', async () => {
    render(<SignUpForm />);
    fireEvent.change(screen.getByPlaceholderText(/fullNamePlaceholder/i), {
      target: { value: 'John Doe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /signup/i }));
    await waitFor(() => {
      expect(screen.getByText(/validation.businessNameRequired/i)).toBeInTheDocument();
    });
  });
});
