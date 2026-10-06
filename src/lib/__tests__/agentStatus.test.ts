import { describe, expect, it } from "vitest";
import {
  deriveCampaignActivity,
  deriveShotStatus,
  formatMoney,
  groupByTurn,
  isApprovalActionable,
  STALE_GENERATION_MS,
} from "../agentStatus";

const NOW = Date.parse("2026-10-06T20:30:00Z");

describe("deriveShotStatus", () => {
  it("never calls a failed QA reviewed or ready", () => {
    expect(deriveShotStatus({ id: "s", status: "qa_failed" }, undefined, false, NOW)).toBe("qa_unavailable");
  });
  it("needs_retry waits for approval only when a pending approval scopes the shot", () => {
    expect(deriveShotStatus({ id: "s", status: "needs_retry" }, undefined, true, NOW)).toBe("awaiting_approval");
    expect(deriveShotStatus({ id: "s", status: "needs_retry" }, undefined, false, NOW)).toBe("needs_changes");
  });
  it("derives generating from the real job", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    expect(deriveShotStatus({ id: "s", status: "generating" }, { id: "g", status: "completed" }, false, NOW)).toBe("checking");
    expect(deriveShotStatus({ id: "s", status: "generating" }, { id: "g", status: "pending", created_at: recent }, false, NOW)).toBe("queued");
    expect(deriveShotStatus({ id: "s", status: "generating" }, { id: "g", status: "processing", created_at: recent }, false, NOW)).toBe("generating");
    expect(deriveShotStatus({ id: "s", status: "generating" }, { id: "g", status: "failed" }, false, NOW)).toBe("failed");
    expect(deriveShotStatus({ id: "s", status: "generating" }, undefined, false, NOW)).toBe("unknown");
    const old = new Date(NOW - STALE_GENERATION_MS - 1).toISOString();
    expect(deriveShotStatus({ id: "s", status: "generating" }, { id: "g", status: "processing", created_at: old }, false, NOW)).toBe("interrupted");
  });
  it("visual ready is separate from final ad", () => {
    expect(deriveShotStatus({ id: "s", status: "client_ready" }, undefined, false, NOW)).toBe("visual_ready");
  });
});

describe("deriveCampaignActivity", () => {
  it("does not claim production is running when shots wait for retry approval", () => {
    expect(deriveCampaignActivity(["needs_changes", "needs_changes"], false)).toBe("needs_changes");
    expect(deriveCampaignActivity(["awaiting_approval", "needs_changes"], true)).toBe("awaiting_approval");
  });
  it("is running only with an active job", () => {
    expect(deriveCampaignActivity(["generating", "visual_ready"], false)).toBe("running");
  });
});

describe("groupByTurn", () => {
  it("attaches old approvals to their own turn, not the latest message", () => {
    const users = ["2026-10-02T10:00:00Z", "2026-10-06T20:24:53Z"];
    const approvals = [{ id: "old", createdAt: "2026-10-02T10:05:00Z" }];
    const g = groupByTurn(users, approvals, (a) => a.createdAt);
    expect(g.get(0)?.map((a) => a.id)).toEqual(["old"]);
    expect(g.get(1)).toBeUndefined();
  });
});

describe("isApprovalActionable", () => {
  it("rejects expired, consumed and rejected approvals", () => {
    const future = new Date(NOW + 60_000).toISOString();
    const past = new Date(NOW - 60_000).toISOString();
    expect(isApprovalActionable("pending", future, NOW)).toBe(true);
    expect(isApprovalActionable("pending", past, NOW)).toBe(false);
    expect(isApprovalActionable("approved", future, NOW)).toBe(false);
    expect(isApprovalActionable("expired", future, NOW)).toBe(false);
    expect(isApprovalActionable("pending", undefined, NOW)).toBe(false);
  });
});

describe("formatMoney", () => {
  it("uses the stored currency and never swaps symbols", () => {
    expect(formatMoney(3.4, "USD")).toBe("3.40 USD");
    expect(formatMoney(3.4, "eur")).toBe("3.40 EUR");
    expect(formatMoney(3.4, "")).toBe("3.40");
  });
});
