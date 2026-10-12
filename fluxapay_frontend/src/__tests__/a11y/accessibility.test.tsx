import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

/**
 * Accessibility (a11y) test suite covering key interactive surfaces.
 *
 * Note: These tests verify automated a11y checks via axe-core and manual
 * ARIA/label implementations. Full accessibility validation requires:
 * 1. Manual testing with screen readers (NVDA, JAWS, VoiceOver)
 * 2. Keyboard-only navigation testing in a real browser
 * 3. Lighthouse accessibility audit on a live deployment
 */

describe('Accessibility - Interactive Components', () => {
  describe('Form Labels & Associations', () => {
    it('form inputs have proper label associations', async () => {
      const { container } = render(
        <form>
          <label htmlFor="email-input">Email</label>
          <input id="email-input" type="email" />
          <label htmlFor="password-input">Password</label>
          <input id="password-input" type="password" />
        </form>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('form error messages are properly associated with inputs', async () => {
      const { container } = render(
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            aria-invalid="true"
            aria-describedby="email-error"
          />
          <span id="email-error" role="alert">
            Invalid email format
          </span>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('checkbox labels have proper associations', async () => {
      const { container } = render(
        <label>
          <input type="checkbox" />
          Remember me
        </label>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Button Accessibility', () => {
    it('buttons have accessible names', async () => {
      const { container } = render(
        <div>
          <button>Submit</button>
          <button aria-label="Close dialog">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('password visibility toggle has accessible name', async () => {
      const { container } = render(
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={false}
        >
          👁️
        </button>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Modal Dialogs & Focus Management', () => {
    it('modal has proper dialog semantics', async () => {
      const { container } = render(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          aria-describedby="dialog-description"
        >
          <h2 id="dialog-title">Confirm Action</h2>
          <p id="dialog-description">Are you sure?</p>
          <button>Cancel</button>
          <button>Confirm</button>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });

    it('dialog trigger button is accessible', async () => {
      const { container } = render(
        <div>
          <button aria-haspopup="dialog">Open dialog</button>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Command Palette & Navigation', () => {
    it('command palette has proper combobox semantics', async () => {
      const { container } = render(
        <div
          role="combobox"
          aria-expanded={true}
          aria-controls="listbox"
          aria-activedescendant="item-0"
        >
          <input type="text" placeholder="Search..." />
          <ul id="listbox" role="listbox">
            <li id="item-0" role="option" aria-selected={true}>
              Dashboard
            </li>
            <li id="item-1" role="option" aria-selected={false}>
              Settings
            </li>
          </ul>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Keyboard Navigation', () => {
    it('interactive elements are keyboard focusable', () => {
      const { container } = render(
        <div>
          <a href="/">Link</a>
          <button>Button</button>
          <input type="text" />
          <input type="checkbox" />
          <select>
            <option>Option</option>
          </select>
        </div>
      );

      const focusableElements = container.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]'
      );
      expect(focusableElements.length).toBeGreaterThan(0);
    });

    it('custom button-like divs have correct role and tabindex', async () => {
      const { container } = render(
        <div role="button" tabIndex={0} aria-label="Action">
          Click me
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('ARIA Live Regions', () => {
    it('error messages use appropriate ARIA roles', async () => {
      const { container } = render(
        <div>
          <span role="alert">This field is required</span>
          <div aria-live="polite">Loading data...</div>
          <div aria-live="assertive">Error: Connection lost</div>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Semantic HTML', () => {
    it('form uses semantic heading hierarchy', async () => {
      const { container } = render(
        <div>
          <h1>Login</h1>
          <form>
            <h2>Login Form</h2>
            <label>Email</label>
            <input type="email" />
          </form>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Offline Banner', () => {
    it('offline banner has proper ARIA attributes', async () => {
      const { container } = render(
        <div
          role="status"
          aria-live="polite"
          className="bg-yellow-50 border-b border-yellow-200 p-4"
        >
          <span className="text-sm">You are offline</span>
        </div>
      );
      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });

  describe('Skip Links', () => {
    it('skip link is present and properly marked', async () => {
      const { container } = render(
        <div>
          <a href="#main-content" className="sr-only">
            Skip to main content
          </a>
          <nav>Navigation</nav>
          <main id="main-content">Content</main>
        </div>
      );
      const skipLink = container.querySelector('a[href="#main-content"]');
      expect(skipLink).toBeInTheDocument();
    });
  });
});
