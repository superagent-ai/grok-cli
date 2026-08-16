import { describe, expect, it } from "vitest";
import { classifySteering, isRepeatedRejected } from "./steering.js";

describe("classifySteering", () => {
  it("marks exact matches", () => {
    expect(classifySteering("run the tests", "run the tests").classification).toBe("accepted_exact");
  });

  it("marks light edits as accepted_edited", () => {
    expect(classifySteering("please run the tests now", "please run the tests", 0.5).classification).toBe(
      "accepted_edited",
    );
  });

  it("marks a different course", () => {
    expect(classifySteering("run the tests", "rewrite the README instead").classification).toBe("changed_course");
  });
});

describe("isRepeatedRejected", () => {
  it("suppresses a previously rejected suggestion", () => {
    expect(
      isRepeatedRejected("run the tests", [
        {
          classification: "changed_course",
          suggestedPrompt: "run the tests",
          actualUserPrompt: "do something else",
          similarity: 0.1,
          at: "2026-08-16T12:00:00.000Z",
        },
      ]),
    ).toBe(true);
    expect(isRepeatedRejected("ship it", [])).toBe(false);
  });
});
