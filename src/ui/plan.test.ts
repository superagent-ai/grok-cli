import { describe, expect, it } from "vitest";
import type { PlanQuestion } from "../types";
import {
  arePlanQuestionsAnswered,
  firstUnansweredPlanQuestionIndex,
  hasPlanAnswer,
  initialPlanQuestionsState,
  movePlanQuestionTab,
  nextPlanTabAfterAnswer,
  PLAN_QUESTION_REQUIRED_NOTICE,
} from "./plan";

const questions = [
  {
    id: "where",
    question: "Where should the test file be created?",
    type: "select",
    options: [
      { id: "tests", label: "tests/" },
      { id: "src-test", label: "src/test/" },
    ],
  },
  {
    id: "notes",
    question: "Any extra notes?",
    type: "text",
  },
] satisfies PlanQuestion[];

describe("plan question helpers", () => {
  it("treats empty strings and empty arrays as unanswered", () => {
    expect(hasPlanAnswer({ where: "" }, questions[0]!)).toBe(false);
    expect(hasPlanAnswer({ where: [] }, questions[0]!)).toBe(false);
    expect(hasPlanAnswer({ where: "tests" }, questions[0]!)).toBe(true);
    expect(hasPlanAnswer({ where: ["tests"] }, questions[0]!)).toBe(true);
  });

  it("finds unanswered questions before allowing final submission", () => {
    expect(arePlanQuestionsAnswered(questions, { where: "tests" })).toBe(false);
    expect(firstUnansweredPlanQuestionIndex(questions, { where: "tests" })).toBe(1);
    expect(arePlanQuestionsAnswered(questions, { where: "tests", notes: "ship it" })).toBe(true);
    expect(firstUnansweredPlanQuestionIndex(questions, { where: "tests", notes: "ship it" })).toBeNull();
  });

  it("advances to the next unanswered question and only then to confirm", () => {
    expect(nextPlanTabAfterAnswer(questions, 0, { where: "tests" })).toBe(1);
    expect(nextPlanTabAfterAnswer(questions, 1, { where: "tests", notes: "done" })).toBe(2);
  });

  it("blocks forward tabbing from an unanswered question but allows moving back", () => {
    const state = { ...initialPlanQuestionsState(), tab: 1 };
    expect(movePlanQuestionTab(questions, state, 1)).toMatchObject({
      tab: 1,
      notice: PLAN_QUESTION_REQUIRED_NOTICE,
    });

    expect(movePlanQuestionTab(questions, state, -1)).toMatchObject({
      tab: 0,
      selected: 0,
      editing: false,
      notice: undefined,
    });
  });
});
