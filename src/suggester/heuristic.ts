import type { SuggestionPromptContext } from "./types.js";

export interface HeuristicSuggestion {
  text: string;
  confidence: "high" | "low";
}

const YES_QUESTION =
  /\b(want me to|should i|shall i|can i go ahead|ready for me to|do you want me to|ok to|okay to)\b/i;
const PROCEED_CUE =
  /\b(say the word|if you('d| would) like|when you('re| are) ready|i can (do|run|add|fix|continue))\b/i;

export function inferHeuristicSuggestion(context: SuggestionPromptContext): HeuristicSuggestion | null {
  if (context.turnStatus !== "success") {
    return { text: "continue", confidence: "high" };
  }

  const assistant = context.latestAssistantTurn.trim();
  if (!assistant) return null;

  const lastQuestion = lastQuestionLine(assistant) ?? context.unresolvedQuestions.at(-1);
  if (lastQuestion && isYesNoQuestion(lastQuestion)) {
    return { text: "Yes.", confidence: context.customInstruction.trim() ? "low" : "high" };
  }

  if (PROCEED_CUE.test(tail(assistant, 500))) {
    return { text: "Go ahead.", confidence: "low" };
  }

  return null;
}

function lastQuestionLine(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+\.\s+/, ""),
    )
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (line.endsWith("?")) return line;
  }
  return undefined;
}

function isYesNoQuestion(question: string): boolean {
  if (question.length > 180) return false;
  if (YES_QUESTION.test(question)) return true;
  return /^(want|should|shall|can|may|do|did|does|is|are|ready)\b/i.test(question);
}

function tail(value: string, max: number): string {
  return value.length <= max ? value : value.slice(-max);
}
