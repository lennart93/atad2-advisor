// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WhySuggestedTip } from "../WhySuggestedTip";

afterEach(cleanup);

const RATIONALE =
  "S4 Energy BV is a Dutch private limited company (BV) and heads a Dutch fiscal unity for corporate income tax purposes.";

describe("WhySuggestedTip", () => {
  it("renders the hover affordance wired to the tooltip", () => {
    render(<WhySuggestedTip rationale={RATIONALE} entityName="S4 Energy BV" />);
    const trigger = screen.getByRole("button", { name: /why this is suggested/i });
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("shows the kicker with the entity name and the rationale body", () => {
    render(<WhySuggestedTip rationale={RATIONALE} entityName="S4 Energy BV" />);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(/From the facts · S4 Energy BV/);
    expect(tooltip).toHaveTextContent(/heads a Dutch fiscal unity/);
  });

  it("sets the entity name in medium ink inside the body", () => {
    render(<WhySuggestedTip rationale={RATIONALE} entityName="S4 Energy BV" />);
    const tooltip = screen.getByRole("tooltip");
    const bodyEntity = Array.from(
      tooltip.querySelectorAll("span.font-medium"),
    ).find((el) => el.textContent === "S4 Energy BV");
    expect(bodyEntity).toBeTruthy();
  });

  it("omits the entity from the kicker when no name is known", () => {
    render(<WhySuggestedTip rationale={RATIONALE} entityName={null} />);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("From the facts");
    expect(tooltip).not.toHaveTextContent("·");
  });

  it("renders the body untouched when the entity does not occur in it", () => {
    render(
      <WhySuggestedTip rationale="No related entity is mentioned." entityName="S4 Energy BV" />,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "No related entity is mentioned.",
    );
  });
});
