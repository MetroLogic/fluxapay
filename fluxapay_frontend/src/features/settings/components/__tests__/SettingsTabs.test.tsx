import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SettingsTabs } from "../SettingsTabs";

describe("SettingsTabs breadcrumb navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders breadcrumb navigation with Dashboard link and Settings page when on profile tab", () => {
    const onTabChange = vi.fn();

    render(
      <SettingsTabs
        activeTab="profile"
        onTabChange={onTabChange}
        hasUnsavedChanges={false}
      >
        <div>Profile Content</div>
      </SettingsTabs>
    );

    const nav = screen.getByRole("navigation", { name: "Settings breadcrumb" });
    expect(nav).toBeInTheDocument();

    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");

    const settingsItem = screen.getByText("Settings", { selector: "span" });
    expect(settingsItem).toHaveAttribute("aria-current", "page");
  });

  it("renders breadcrumbs showing Dashboard > Settings > Security when security tab is active", () => {
    const onTabChange = vi.fn();

    render(
      <SettingsTabs
        activeTab="security"
        onTabChange={onTabChange}
        hasUnsavedChanges={false}
      >
        <div>Security Content</div>
      </SettingsTabs>
    );

    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink).toBeInTheDocument();

    // Settings is now a clickable button to navigate back to root settings
    const settingsButton = screen.getByRole("button", { name: "Settings" });
    expect(settingsButton).toBeInTheDocument();

    // Security is the active current page
    const securityPage = screen.getByText("Security", { selector: "span" });
    expect(securityPage).toHaveAttribute("aria-current", "page");
  });

  it("calls onTabChange with 'profile' when clicking Settings button in breadcrumbs", () => {
    const onTabChange = vi.fn();

    render(
      <SettingsTabs
        activeTab="webhooks"
        onTabChange={onTabChange}
        hasUnsavedChanges={false}
      >
        <div>Webhooks Content</div>
      </SettingsTabs>
    );

    const settingsButton = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settingsButton);

    expect(onTabChange).toHaveBeenCalledWith("profile");
  });

  it("guards against navigating when hasUnsavedChanges is true and user cancels", () => {
    const onTabChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <SettingsTabs
        activeTab="api-keys"
        onTabChange={onTabChange}
        hasUnsavedChanges={true}
      >
        <div>API Keys Content</div>
      </SettingsTabs>
    );

    const settingsButton = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settingsButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(onTabChange).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("allows navigating when hasUnsavedChanges is true and user confirms", () => {
    const onTabChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <SettingsTabs
        activeTab="api-keys"
        onTabChange={onTabChange}
        hasUnsavedChanges={true}
      >
        <div>API Keys Content</div>
      </SettingsTabs>
    );

    const settingsButton = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settingsButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(onTabChange).toHaveBeenCalledWith("profile");

    confirmSpy.mockRestore();
  });
});
