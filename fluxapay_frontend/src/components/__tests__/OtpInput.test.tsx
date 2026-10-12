import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { OtpInput } from "@/components/OtpInput";

describe("OtpInput", () => {
  it("renders correct number of input boxes with aria-labels", () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} length={6} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(6);
    inputs.forEach((input, idx) => {
      expect(input.getAttribute("aria-label")).toBe(`Digit ${idx + 1} of 6`);
    });
  });

  it("auto-advances focus to next input on character entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} length={6} />);
    const inputs = screen.getAllByRole("textbox");
    
    await user.type(inputs[0], "1");
    expect(inputs[1]).toHaveFocus();
    
    await user.type(inputs[1], "2");
    expect(inputs[2]).toHaveFocus();
  });

  it("moves focus to previous input on backspace if current is empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Simulate user has typed "1" in the first box, and is now focused on the second box which is empty
    render(<OtpInput value="1" onChange={onChange} length={6} />);
    const inputs = screen.getAllByRole("textbox");
    
    inputs[1].focus();
    expect(inputs[1]).toHaveFocus();

    await user.keyboard("{Backspace}");
    expect(inputs[0]).toHaveFocus();
  });

  it("distributes pasted characters across boxes and focuses appropriate input", () => {
    // Testing paste event using fireEvent
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} length={6} />);
    const inputs = screen.getAllByRole("textbox");
    
    inputs[0].focus();
    
    // Create a generic clipboard event structure for the test
    const clipboardData = {
      getData: () => "123456"
    };

    fireEvent.paste(inputs[0], {
      clipboardData: clipboardData
    });
    
    expect(onChange).toHaveBeenCalledWith("123456");
    expect(inputs[5]).toHaveFocus();
  });
});
