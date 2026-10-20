import React from 'react';
import { render } from '@testing-library/react';
import { getTextDirection } from '../rtl';
import { CopyField } from '../CopyField';

describe('checkout RTL support', () => {
  it('maps Arabic to rtl and others to ltr', () => {
    expect(getTextDirection('ar')).toBe('rtl');
    expect(getTextDirection('ar-EG')).toBe('rtl');
    expect(getTextDirection('en')).toBe('ltr');
    expect(getTextDirection(undefined)).toBe('ltr');
  });

  it('keeps crypto addresses LTR inside an RTL container', () => {
    const { container } = render(
      <div dir="rtl">
        <CopyField label="Payment Address" value="GABC123STELLARADDRESS" />
      </div>,
    );
    const value = container.querySelector('[dir="ltr"]');
    expect(value).not.toBeNull();
    expect(value!.textContent).toContain('GABC123');
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
  });
});
