export type SuggesterCommandAction =
  | "status"
  | "on"
  | "off"
  | "auto"
  | "ghost"
  | "reseed"
  | "instruction"
  | "model"
  | "help";

export interface ParsedSuggesterCommand {
  action: SuggesterCommandAction;
  rest: string;
}

const SIMPLE_ACTIONS = new Set<SuggesterCommandAction>(["status", "on", "off", "auto", "ghost", "reseed"]);

export function parseSuggesterCommand(cmd: string): ParsedSuggesterCommand | null {
  const trimmed = cmd.trim();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1).trim();
  const [first, ...tail] = body.split(/\s+/).filter(Boolean);
  if ((first ?? "").toLowerCase() !== "suggester") return null;

  const sub = (tail[0] ?? "status").toLowerCase();
  const rest = tail.slice(1).join(" ");
  if (SIMPLE_ACTIONS.has(sub as SuggesterCommandAction)) {
    return { action: sub as SuggesterCommandAction, rest };
  }
  if (sub === "instruction" || sub === "model") {
    return { action: sub, rest };
  }
  return { action: "help", rest: "" };
}

export function suggesterUsageText(): string {
  return [
    "Usage:",
    "  /suggester                 Show status",
    "  /suggester on|off          Enable or disable",
    "  /suggester auto|ghost      Auto-insert or dim ghost",
    "  /suggester reseed          Refresh project-intent seed",
    "  /suggester instruction     Show custom instruction",
    "  /suggester instruction set <text>",
    "  /suggester instruction clear",
    "  /suggester model           Show suggester/seeder models",
    "  /suggester model set <id>",
    "  /suggester model seeder <id>",
  ].join("\n");
}
