import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "../breadcrumb";

describe("Breadcrumb UI Component", () => {
  it("renders a semantic nav with breadcrumb label", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );

    const nav = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByText("Settings")).toHaveAttribute("aria-current", "page");
  });

  it("supports asChild on BreadcrumbLink", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button">Custom Button</button>
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );

    const button = screen.getByRole("button", { name: "Custom Button" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("transition-colors");
  });

  it("renders custom separator and ellipsis", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>Current</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );

    expect(screen.getAllByText("/")).toHaveLength(2);
    expect(screen.getByText("More")).toBeInTheDocument();
    expect(screen.getByText("Current")).toHaveAttribute("aria-current", "page");
  });
});
