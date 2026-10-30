import { describe, expect, it } from "vitest";
import { mergeAssemblyItems, placeAssemblyItems } from "./agentStatus";
describe("mergeAssemblyItems", () => {
  const P = "433af1d8-a977-4ec6-bcad-4ba9e776c349";
  it("pending job without operation row still yields an actionable card", () => {
    const r = mergeAssemblyItems([], [{ id: P, status: "pending", created_at: "2026-10-10T20:26:09Z" }]);
    expect(r).toHaveLength(1); expect(r[0].r.assembly_id).toBe(P); expect(r[0].actionable).toBe(true);
  });
  it("operation row + job row → one card", () => {
    const r = mergeAssemblyItems([{ at: "2026-10-10T20:26:09Z", r: { assembly_id: P, card: {} } }], [{ id: P, status: "pending" }]);
    expect(r).toHaveLength(1); expect(r[0].r.card).toBeDefined(); expect(r[0].actionable).toBe(true);
  });
  it("old superseded + one pending → only pending actionable", () => {
    const r = mergeAssemblyItems([{ at: "2026-10-09T00:00:00Z", r: { assembly_id: "old" } }],
      [{ id: P, status: "pending", created_at: "2026-10-10T00:00:00Z" }, { id: "old", status: "superseded" }]);
    expect(r.find((x) => x.r.assembly_id === "old")!.actionable).toBe(false);
    expect(r.find((x) => x.r.assembly_id === P)!.actionable).toBe(true);
  });
  it("non-pending discovered rows without operation are not shown; result is stable across reloads", () => {
    const d = [{ id: P, status: "pending", created_at: "x" }, { id: "done1", status: "done" }];
    expect(mergeAssemblyItems([], d)).toEqual(mergeAssemblyItems([], d));
    expect(mergeAssemblyItems([], d).map((x) => x.r.assembly_id)).toEqual([P]);
  });
  it("merge is pure: inputs are not mutated", () => {
    const d = [{ id: P, status: "pending" }]; const snap = JSON.stringify(d);
    mergeAssemblyItems([], d); expect(JSON.stringify(d)).toBe(snap);
  });
  it("pins the actionable assembly and removes its old-turn duplicate", () => {
    const items = mergeAssemblyItems(
      [{ at: "2026-10-09T00:00:00Z", r: { assembly_id: "old" } }],
      [{ id: P, status: "pending", created_at: "2026-10-10T00:00:00Z" }, { id: "old", status: "superseded" }],
    );
    const placed = placeAssemblyItems(items);
    expect(placed.pinned?.r.assembly_id).toBe(P);
    expect(placed.history.map((item) => item.r.assembly_id)).toEqual(["old"]);
  });
  it("keeps final history unchanged when there is no open approval", () => {
    const item = { at: "2026-10-09T00:00:00Z", r: { assembly_id: "done" }, actionable: false };
    expect(placeAssemblyItems([item])).toEqual({ pinned: null, history: [item] });
  });
});
describe("failed / running assemblies stay pinned", () => {
  it("newest failed (prepared from the card, no op row) is pinned", () => {
    const r = mergeAssemblyItems([{ at: "2026-10-10T20:26:09Z", r: { assembly_id: "old" } }],
      [{ id: "f", status: "failed", created_at: "2026-10-12T12:49:40Z" }, { id: "old", status: "superseded", created_at: "2026-10-10T20:26:09Z" }]);
    expect(placeAssemblyItems(r).pinned?.r.assembly_id).toBe("f");
  });
  it("new pending after failed → only the new one is pinned", () => {
    const r = mergeAssemblyItems([], [{ id: "n", status: "pending", created_at: "2026-10-12T15:00:00Z" }, { id: "f", status: "failed", created_at: "2026-10-12T12:49:40Z" }]);
    expect(r.map((x) => x.r.assembly_id)).toEqual(["n"]);
    expect(placeAssemblyItems(r).pinned?.r.assembly_id).toBe("n");
  });
  it("running stays pinned; done is never pinned", () => {
    expect(placeAssemblyItems(mergeAssemblyItems([], [{ id: "r", status: "running", created_at: "x" }])).pinned?.r.assembly_id).toBe("r");
    expect(placeAssemblyItems(mergeAssemblyItems([{ at: "x", r: { assembly_id: "d" } }], [{ id: "d", status: "done", created_at: "x" }])).pinned).toBeNull();
  });
});
describe("real Café Buur live states stay pinned", () => {
  const ops = [{ at: "2026-10-10T20:26:09Z", r: { assembly_id: "433a" } }];
  const disc = (s: string) => [{ id: "24ed", status: s, created_at: "2026-10-12T16:00:00Z" }, { id: "5ef2", status: "failed", created_at: "2026-10-12T12:49:40Z" }, { id: "433a", status: "superseded", created_at: "2026-10-10T20:26:09Z" }];
  it.each(["pending", "running", "failed"])("%s stays pinned over older op rows", (s) => {
    expect(placeAssemblyItems(mergeAssemblyItems(ops, disc(s))).pinned?.r.assembly_id).toBe("24ed");
  });
});
