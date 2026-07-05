import { describe, it, expect } from "vitest";
import { parseFiscalYears, formatFiscalYears } from "../formatFiscalYears";

describe("parseFiscalYears", () => {
  it("returns an empty list for empty/nullish input", () => {
    expect(parseFiscalYears("")).toEqual([]);
    expect(parseFiscalYears(null)).toEqual([]);
    expect(parseFiscalYears(undefined)).toEqual([]);
  });

  it("parses a single legacy year", () => {
    expect(parseFiscalYears("2024")).toEqual([2024]);
  });

  it("parses a comma-joined list and sorts ascending", () => {
    expect(parseFiscalYears("2025, 2023, 2024")).toEqual([2023, 2024, 2025]);
  });

  it("de-duplicates repeated years", () => {
    expect(parseFiscalYears("2024, 2024, 2023")).toEqual([2023, 2024]);
  });

  it("tolerates loose whitespace and separators", () => {
    expect(parseFiscalYears(" 2023 ,2024  2025 ")).toEqual([2023, 2024, 2025]);
  });
});

describe("formatFiscalYears", () => {
  it("renders an empty string for empty input", () => {
    expect(formatFiscalYears("")).toBe("");
    expect(formatFiscalYears(null)).toBe("");
  });

  it("renders a single year unchanged", () => {
    expect(formatFiscalYears("2024")).toBe("2024");
  });

  it("collapses a contiguous run into a hyphen range", () => {
    expect(formatFiscalYears("2023, 2024, 2025")).toBe("2023-2025");
  });

  it("keeps non-contiguous years as a comma list", () => {
    expect(formatFiscalYears("2023, 2025")).toBe("2023, 2025");
  });

  it("mixes ranges and gaps", () => {
    expect(formatFiscalYears("2021, 2022, 2024, 2026, 2027")).toBe(
      "2021-2022, 2024, 2026-2027",
    );
  });

  it("normalises order before formatting", () => {
    expect(formatFiscalYears("2025, 2023, 2024")).toBe("2023-2025");
  });
});
