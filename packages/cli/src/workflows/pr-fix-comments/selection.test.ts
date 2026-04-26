import { describe, expect, it } from "vitest";

import { parsePullRequestReviewSelection } from "./selection";

describe("pr-fix-comments selection helpers", () => {
  it("defaults blank review selection to every individual thread", () => {
    expect(parsePullRequestReviewSelection("", 3, 2)).toEqual([
      { kind: "thread", index: 0 },
      { kind: "thread", index: 1 },
      { kind: "thread", index: 2 },
    ]);
    expect(parsePullRequestReviewSelection("   ", 2, 0)).toEqual([
      { kind: "thread", index: 0 },
      { kind: "thread", index: 1 },
    ]);
  });

  it("keeps explicit review skip and selection inputs unchanged", () => {
    expect(parsePullRequestReviewSelection("none", 3, 1)).toEqual([]);
    expect(parsePullRequestReviewSelection("n", 3, 1)).toEqual([]);
    expect(parsePullRequestReviewSelection("all", 2, 1)).toEqual([
      { kind: "thread", index: 0 },
      { kind: "thread", index: 1 },
    ]);
    expect(parsePullRequestReviewSelection("g1,2", 3, 1)).toEqual([
      { kind: "group", index: 0 },
      { kind: "thread", index: 1 },
    ]);
  });
});
