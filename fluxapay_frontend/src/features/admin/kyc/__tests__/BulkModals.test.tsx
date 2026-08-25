import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import BulkApproveModal from "@/features/admin/kyc/BulkApproveModal";
import BulkRejectModal from "@/features/admin/kyc/BulkRejectModal";

describe("KYC Bulk Confirmation Modals", () => {
  describe("BulkApproveModal", () => {
    it("renders count of selected merchants and requires confirmation before calling onConfirm", async () => {
      const onConfirm = vi.fn().mockResolvedValue({ succeeded: 5, failed: [] });
      const onClose = vi.fn();

      render(<BulkApproveModal count={5} onConfirm={onConfirm} onClose={onClose} />);

      expect(screen.getByText("Bulk Approve 5 Applications")).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();

      // Typing APPROVE enables confirmation
      const input = screen.getByPlaceholderText("Type APPROVE to confirm...");
      await userEvent.type(input, "APPROVE");

      const confirmButton = screen.getByRole("button", { name: "Yes, I'm sure" });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1);
      });
    });

    it("dismisses modal safely when Escape is pressed", async () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(<BulkApproveModal count={3} onConfirm={onConfirm} onClose={onClose} />);

      fireEvent.keyDown(window, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("BulkRejectModal", () => {
    it("renders count, requires reason and confirmation before calling onConfirm", async () => {
      const onConfirm = vi.fn().mockResolvedValue({ succeeded: 2, failed: [] });
      const onClose = vi.fn();

      render(<BulkRejectModal count={2} onConfirm={onConfirm} onClose={onClose} />);

      expect(screen.getByText("Bulk Reject 2 Applications")).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();

      // Select reason
      const select = screen.getByRole("combobox");
      await userEvent.selectOptions(select, "fraud_risk");

      const confirmButton = screen.getByRole("button", { name: "Confirm Rejection" });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith("fraud_risk", "");
      });
    });

    it("dismisses modal safely when Escape is pressed", async () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(<BulkRejectModal count={4} onConfirm={onConfirm} onClose={onClose} />);

      fireEvent.keyDown(window, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
