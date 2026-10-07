import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatRunway,
  getRunwayStatus,
  getRunwayNotice,
  formatDTI,
  getDTIStatus,
  formatSavingsRate,
  formatPercentage,
  safeNumber,
} from "../formatters.ts";

describe("Formatting Helpers Resilience Tests", () => {
  describe("formatRunway", () => {
    it("handles null without crashing and returns display fallback or default", () => {
      assert.equal(formatRunway(null), "Not enough data");
      assert.equal(formatRunway(null, "Not enough data"), "Not enough data");
      assert.equal(formatRunway(null, "Accumulating..."), "Accumulating...");
    });

    it("handles undefined without crashing", () => {
      assert.equal(formatRunway(undefined), "Not enough data");
      assert.equal(formatRunway(undefined, "Calculating"), "Calculating");
    });

    it("handles 0 without treating it as missing/error", () => {
      assert.equal(formatRunway(0), "0.0 mo");
      assert.equal(formatRunway(0.0), "0.0 mo");
    });

    it("handles positive values and rounding", () => {
      assert.equal(formatRunway(3.456), "3.5 mo");
      assert.equal(formatRunway(12), "12.0 mo");
    });

    it("handles extreme runway values >= 990", () => {
      assert.equal(formatRunway(999), "99+ mo");
      assert.equal(formatRunway(1200), "99+ mo");
    });

    it("handles hasSufficientData flag when false", () => {
      assert.equal(formatRunway(5.2, "Not enough data", false), "Not enough data");
      assert.equal(formatRunway(null, "Not enough data", false), "Not enough data");
    });
  });

  describe("getRunwayStatus", () => {
    it("returns neutral Pending badge for null, undefined, or hasSufficientData=false", () => {
      assert.deepEqual(getRunwayStatus(null), {
        label: "Pending",
        badgeClass: "badge-secondary",
        status: "neutral",
      });
      assert.deepEqual(getRunwayStatus(undefined), {
        label: "Pending",
        badgeClass: "badge-secondary",
        status: "neutral",
      });
      assert.deepEqual(getRunwayStatus(6.0, false), {
        label: "Pending",
        badgeClass: "badge-secondary",
        status: "neutral",
      });
    });

    it("returns danger Low for runway < 3", () => {
      assert.deepEqual(getRunwayStatus(0), {
        label: "Low",
        badgeClass: "badge-danger",
        status: "danger",
      });
      assert.deepEqual(getRunwayStatus(2.9), {
        label: "Low",
        badgeClass: "badge-danger",
        status: "danger",
      });
    });

    it("returns warning Moderate for 3 <= runway < 6", () => {
      assert.deepEqual(getRunwayStatus(3.0), {
        label: "Moderate",
        badgeClass: "badge-warning",
        status: "warning",
      });
      assert.deepEqual(getRunwayStatus(5.9), {
        label: "Moderate",
        badgeClass: "badge-warning",
        status: "warning",
      });
    });

    it("returns success Healthy for runway >= 6", () => {
      assert.deepEqual(getRunwayStatus(6.0), {
        label: "Healthy",
        badgeClass: "badge-success",
        status: "success",
      });
      assert.deepEqual(getRunwayStatus(12.5), {
        label: "Healthy",
        badgeClass: "badge-success",
        status: "success",
      });
    });
  });

  describe("getRunwayNotice", () => {
    it("returns notice text when hasSufficientData is false", () => {
      assert.equal(
        getRunwayNotice(false),
        "Add at least 2 weeks of spending for reliable advice."
      );
      assert.equal(
        getRunwayNotice(false, "Custom notice message"),
        "Custom notice message"
      );
    });

    it("returns null when hasSufficientData is true or undefined", () => {
      assert.equal(getRunwayNotice(true), null);
      assert.equal(getRunwayNotice(undefined), null);
    });
  });

  describe("formatDTI", () => {
    it("handles null and undefined without crashing", () => {
      assert.equal(formatDTI(null), "0.0%");
      assert.equal(formatDTI(undefined), "0.0%");
    });

    it("handles 0 correctly", () => {
      assert.equal(formatDTI(0), "0.0%");
    });

    it("formats valid DTI percentages", () => {
      assert.equal(formatDTI(28.4), "28.4%");
      assert.equal(formatDTI(45.67, 2), "45.67%");
    });
  });

  describe("getDTIStatus", () => {
    it("handles null, undefined, 0", () => {
      assert.deepEqual(getDTIStatus(null), { label: "Safe", badgeClass: "badge-success", status: "success" });
      assert.deepEqual(getDTIStatus(undefined), { label: "Safe", badgeClass: "badge-success", status: "success" });
      assert.deepEqual(getDTIStatus(0), { label: "Safe", badgeClass: "badge-success", status: "success" });
    });

    it("categorizes caution and danger thresholds", () => {
      assert.deepEqual(getDTIStatus(24.9), { label: "Safe", badgeClass: "badge-success", status: "success" });
      assert.deepEqual(getDTIStatus(35.0), { label: "Caution", badgeClass: "badge-warning", status: "warning" });
      assert.deepEqual(getDTIStatus(45.0), { label: "Critical", badgeClass: "badge-danger", status: "danger" });
    });
  });

  describe("formatSavingsRate", () => {
    it("handles null and undefined", () => {
      assert.equal(formatSavingsRate(null), "0.0%");
      assert.equal(formatSavingsRate(undefined), "0.0%");
    });

    it("handles 0 and negative values", () => {
      assert.equal(formatSavingsRate(0), "0.0%");
      assert.equal(formatSavingsRate(-5.2), "-5.2%");
    });

    it("handles positive values", () => {
      assert.equal(formatSavingsRate(25.4), "25.4%");
    });
  });

  describe("formatPercentage", () => {
    it("handles null, undefined, 0", () => {
      assert.equal(formatPercentage(null), "0%");
      assert.equal(formatPercentage(undefined, 1, "N/A"), "N/A");
      assert.equal(formatPercentage(0), "0%");
      assert.equal(formatPercentage(85.4, 1), "85.4%");
    });
  });

  describe("safeNumber", () => {
    it("handles null, undefined, NaN, strings, numbers", () => {
      assert.equal(safeNumber(null), 0);
      assert.equal(safeNumber(undefined, 10), 10);
      assert.equal(safeNumber("123.45"), 123.45);
      assert.equal(safeNumber("invalid", 5), 5);
      assert.equal(safeNumber(42), 42);
    });
  });
});
