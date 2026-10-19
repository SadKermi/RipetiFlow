import { describe, expect, it } from "vitest";
import { positionChanges } from "./settings";

describe("positionChanges", () => {
  const subjects = [
    { id: "a", position: 1 },
    { id: "b", position: 2 },
    { id: "c", position: 3 },
  ];

  it("patches only the subjects whose position changes", () => {
    expect(positionChanges(subjects, ["a", "c", "b"])).toEqual([
      { id: "c", position: 2 },
      { id: "b", position: 3 },
    ]);
    expect(positionChanges(subjects, ["a", "b", "c"])).toEqual([]);
  });

  it("renumbers ties and gaps left by older data", () => {
    const messy = [
      { id: "a", position: 0 },
      { id: "b", position: 0 },
      { id: "c", position: 7 },
    ];
    expect(positionChanges(messy, ["b", "a", "c"])).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
      { id: "c", position: 3 },
    ]);
  });
});
