import { parseSuggesterCommand, suggesterUsageText } from "./command.js";

export interface SuggesterCommandApi {
  setEnabled: (enabled: boolean) => void;
  setAutoAccept: (autoAccept: boolean) => void;
  requestReseed: () => void;
  setCustomInstruction: (instruction: string) => void;
  setSuggesterModel: (model: string) => void;
  setSeederModel: (model: string) => void;
  formatStatus: () => string;
}

export function handleSuggesterCommand(cmd: string, api: SuggesterCommandApi, reply: (text: string) => void): boolean {
  const parsed = parseSuggesterCommand(cmd);
  if (!parsed) return false;

  const rest = parsed.rest;
  switch (parsed.action) {
    case "help":
      reply(suggesterUsageText());
      return true;
    case "on":
      api.setEnabled(true);
      reply("Prompt suggester enabled.");
      return true;
    case "off":
      api.setEnabled(false);
      reply("Prompt suggester disabled.");
      return true;
    case "auto":
      api.setAutoAccept(true);
      reply("Prompt suggester will insert the next prompt.");
      return true;
    case "ghost":
      api.setAutoAccept(false);
      reply("Prompt suggester will show a dim ghost. Space accepts.");
      return true;
    case "reseed":
      api.requestReseed();
      reply("Suggester reseed queued.");
      return true;
    case "instruction": {
      const [verb, ...instructionParts] = rest.split(/\s+/);
      if (!verb || verb.toLowerCase() === "show") {
        reply(api.formatStatus());
        return true;
      }
      if (verb.toLowerCase() === "clear") {
        api.setCustomInstruction("");
        reply("Suggester instruction cleared.");
        return true;
      }
      const text = (verb.toLowerCase() === "set" ? instructionParts.join(" ") : rest).trim();
      if (!text) {
        reply("Usage: /suggester instruction set <text>");
        return true;
      }
      api.setCustomInstruction(text);
      reply("Suggester instruction saved.");
      return true;
    }
    case "model": {
      const [verb, ...modelParts] = rest.split(/\s+/);
      if (!verb || verb.toLowerCase() === "show") {
        reply(api.formatStatus());
        return true;
      }
      if (verb.toLowerCase() === "seeder") {
        const model = modelParts.join(" ").trim();
        if (!model) {
          reply("Usage: /suggester model seeder <id>");
          return true;
        }
        api.setSeederModel(model);
        reply(`Seeder model set to ${model}.`);
        return true;
      }
      const model = (verb.toLowerCase() === "set" ? modelParts.join(" ") : rest).trim();
      if (!model) {
        reply("Usage: /suggester model set <id>");
        return true;
      }
      api.setSuggesterModel(model);
      reply(`Suggester model set to ${model}.`);
      return true;
    }
    default:
      reply(api.formatStatus());
      return true;
  }
}
