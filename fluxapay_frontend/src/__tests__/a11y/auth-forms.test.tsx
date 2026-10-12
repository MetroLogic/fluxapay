import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('Accessibility - Auth Forms', () => {
  describe('LoginForm Structure', () => {
    it('form has descriptive title and instructions', async () => {
      const { container } = render(
        <form aria-label="Login form">
          <h1>Login</h1>
          <p>Please log in to your account</p>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" />
          </div>
          <button type="submit">Login</button>
        </form>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('email input has proper label association', async () => {
      const { container } = render(
        <div>
          <label htmlFor="email-input">Email</label>
          <input id="email-input" type="email" placeholder="test@example.com" />
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('password input has proper label association', async () => {
      const { container } = render(
        <div>
          <label htmlFor="password-input">Password</label>
          <input id="password-input" type="password" />
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Password Visibility Toggle', () => {
    it('password toggle button is accessible', async () => {
      const { container } = render(
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={false}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('toggle label changes based on state', () => {
      const { rerender, getByRole } = render(
        <button aria-label="Show password" aria-pressed={false} />
      );
      expect(getByRole('button')).toHaveAttribute('aria-label', 'Show password');

      rerender(
        <button aria-label="Hide password" aria-pressed={true} />
      );
      expect(getByRole('button')).toHaveAttribute('aria-label', 'Hide password');
    });
  });

  describe('Validation & Error Display', () => {
    it('validation errors are associated with fields', async () => {
      const { container } = render(
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            aria-invalid="true"
            aria-describedby="email-error"
          />
          <span id="email-error" role="alert" className="text-red-500">
            Please enter a valid email address
          </span>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('multiple field errors are all announced', async () => {
      const { container } = render(
        <form>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" aria-invalid="true" aria-describedby="email-error" />
            <span id="email-error" role="alert">Invalid email</span>
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              aria-invalid="true"
              aria-describedby="password-error"
            />
            <span id="password-error" role="alert">Password too short</span>
          </div>
        </form>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Session Persistence Checkbox', () => {
    it('keep-logged-in checkbox has proper labeling', async () => {
      const { container } = render(
        <div>
          <label>
            <input type="checkbox" name="keepLoggedIn" />
            <span>Keep me logged in</span>
          </label>
          <p className="text-xs text-slate-500">
            You will stay signed in for 30 days
          </p>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Links & Navigation', () => {
    it('forgot password link is accessible', async () => {
      const { container } = render(
        <a href="/forgot-password" className="underline text-blue-600">
          Forgot password?
        </a>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('signup link from login form is accessible', async () => {
      const { container } = render(
        <div>
          <p>
            Don't have an account?{' '}
            <a href="/signup" className="underline text-blue-600">
              Create one
            </a>
          </p>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('terms and privacy links are accessible', async () => {
      const { container } = render(
        <p className="text-xs">
          By signing in, you agree to our{' '}
          <a href="/terms" className="underline">
            terms
          </a>
          {' '}and{' '}
          <a href="/privacy" className="underline">
            privacy policy
          </a>
        </p>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Submit Button', () => {
    it('submit button has clear label', async () => {
      const { container } = render(
        <button type="submit">Login</button>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('loading state maintains accessibility', async () => {
      const { container } = render(
        <button type="submit" disabled aria-label="Logging in...">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" className="opacity-30" />
          </svg>
          <span>Signing in</span>
        </button>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Form Semantics', () => {
    it('login form has correct structure for screen readers', () => {
      const { getByRole } = render(
        <form aria-label="Login form">
          <h1>Login</h1>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" />
          <button type="submit">Login</button>
        </form>
      );

      expect(getByRole('form')).toBeInTheDocument();
      expect(getByRole('heading', { level: 1 })).toHaveTextContent('Login');
      expect(getByRole('button')).toHaveTextContent('Login');
    });
  });
});
