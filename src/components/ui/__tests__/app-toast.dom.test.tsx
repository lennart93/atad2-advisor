// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import { Toaster, toast } from "../app-toast";

// The toast store is module-level: drain it (dismiss + flush the 300ms exit
// animation timer) between tests so cases stay independent.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  act(() => {
    toast.dismiss();
    vi.advanceTimersByTime(1000);
  });
  cleanup();
  vi.useRealTimers();
});

const stackEl = () => document.querySelector(".apptoast-stack");

describe("app-toast", () => {
  it("renders title, description and state accent, and auto-dismisses after 5s", () => {
    render(<Toaster />);
    act(() => {
      toast.success("Draft saved", { description: "Your changes are saved automatically." });
    });

    expect(screen.getByText("Draft saved")).toBeInTheDocument();
    expect(screen.getByText("Your changes are saved automatically.")).toBeInTheDocument();
    expect(document.querySelector('.apptoast[data-kind="success"]')).toBeInTheDocument();

    // 5s lifetime, then the 300ms exit animation removes the node.
    act(() => vi.advanceTimersByTime(5000));
    expect(document.querySelector(".apptoast")).toHaveAttribute("data-leaving");
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelector(".apptoast")).not.toBeInTheDocument();
  });

  it("keeps a working toast on screen until it is swapped out by id", () => {
    render(<Toaster />);
    let id: string | number = "";
    act(() => {
      id = toast.working("Generating memorandum", { description: "This can take a minute." });
    });

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Generating memorandum")).toBeInTheDocument();
    expect(document.querySelector('.apptoast[data-kind="working"]')).toBeInTheDocument();

    // Swap in place: same card becomes a success toast and now auto-dismisses.
    act(() => {
      toast.success("Memorandum generated", { id, description: "Ready to download." });
    });
    expect(document.querySelectorAll(".apptoast")).toHaveLength(1);
    expect(document.querySelector('.apptoast[data-kind="success"]')).toBeInTheDocument();
    expect(screen.getByText("Memorandum generated")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5300));
    expect(document.querySelector(".apptoast")).not.toBeInTheDocument();
  });

  it("stacks newest on top and dismisses via the close button", () => {
    render(<Toaster />);
    act(() => {
      toast.info("First");
      toast.error("Second");
    });

    const cards = document.querySelectorAll(".apptoast");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Second");
    expect(cards[0]).toHaveAttribute("role", "alert");
    expect(cards[1]).toHaveTextContent("First");

    fireEvent.click(cards[0].querySelector(".apptoast-x")!);
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelectorAll(".apptoast")).toHaveLength(1);
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("runs the inline action and dismisses the toast", () => {
    render(<Toaster />);
    const onClick = vi.fn();
    act(() => {
      toast.success("Word document ready", {
        description: "ATAD2 memo · Client BV.",
        action: { label: "Open", onClick },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelector(".apptoast")).not.toBeInTheDocument();
  });

  it("pauses auto-dismiss while the stack is hovered", () => {
    render(<Toaster />);
    act(() => {
      toast.info("Hover me");
    });

    act(() => vi.advanceTimersByTime(2000));
    fireEvent.mouseEnter(stackEl()!);
    expect(stackEl()).toHaveAttribute("data-paused");

    // Way past the original lifetime, but paused: still on screen.
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("Hover me")).toBeInTheDocument();

    fireEvent.mouseLeave(stackEl()!);
    // 3s of lifetime was left; after that plus the exit animation it is gone.
    act(() => vi.advanceTimersByTime(3300));
    expect(document.querySelector(".apptoast")).not.toBeInTheDocument();
  });
});
