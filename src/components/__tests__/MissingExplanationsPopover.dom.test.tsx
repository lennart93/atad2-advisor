// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import MissingExplanationsPopover from "../MissingExplanationsPopover";

afterEach(cleanup);

const renderPopover = (overrides: Partial<Parameters<typeof MissingExplanationsPopover>[0]> = {}) => {
  const props = {
    missingCount: 3,
    isOpen: true,
    onOpenChange: vi.fn(),
    onGenerateAnyway: vi.fn(),
    onReviewQuestions: vi.fn(),
    ...overrides,
  };
  render(
    <MissingExplanationsPopover {...props}>
      <button>Generate memorandum</button>
    </MissingExplanationsPopover>,
  );
  return props;
};

describe("MissingExplanationsPopover", () => {
  it("shows the plural count in the title with the terracotta count span", () => {
    renderPopover({ missingCount: 3 });
    const count = screen.getByText("3 answers");
    expect(count).toBeInTheDocument();
    expect(count.className).toContain("text-ds-accent");
    expect(screen.getByRole("heading")).toHaveTextContent("3 answers have no context");
  });

  it("uses the singular form for one missing answer", () => {
    renderPopover({ missingCount: 1 });
    expect(screen.getByRole("heading")).toHaveTextContent("1 answer has no context");
  });

  it("routes the two buttons to their callbacks and closes", () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /add context/i }));
    expect(props.onReviewQuestions).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: /generate anyway/i }));
    expect(props.onGenerateAnyway).toHaveBeenCalledTimes(1);
  });

  it("renders the dimming scrim only while open", () => {
    renderPopover({ isOpen: true });
    expect(document.querySelector(".pointer-events-none.fixed.inset-0")).toBeInTheDocument();
    cleanup();
    renderPopover({ isOpen: false });
    expect(document.querySelector(".pointer-events-none.fixed.inset-0")).not.toBeInTheDocument();
  });
});
