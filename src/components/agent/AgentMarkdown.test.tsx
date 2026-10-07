import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentMarkdown } from "./AgentMarkdown";

describe("AgentMarkdown", () => {
  it("renders formatting and safe external links", () => {
    render(<AgentMarkdown>{"**Bold answer**\n\n- First item\n\n[Details](https://example.com)"}</AgentMarkdown>);

    expect(screen.getByText("Bold answer").tagName).toBe("STRONG");
    expect(screen.getByText("First item").closest("ul")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("target", "_blank");
  });

  it("does not render embedded HTML", () => {
    const { container } = render(<AgentMarkdown>{"Before <script>alert('x')</script> after <b>raw</b>"}</AgentMarkdown>);

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("b")).not.toBeInTheDocument();
    expect(screen.getByText(/Before/)).toBeInTheDocument();
  });
});