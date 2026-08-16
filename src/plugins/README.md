# Plugins

Bundled plugins (`/install suggester`) and GitHub plugins
(`/install owner/repo[@ref]`) share the same host.

## GitHub plugin contract

The repo root, or an optional subdir (`/install owner/repo/plugins/weather`),
must contain `plugin.json`:

```json
{
  "id": "weather",
  "name": "Weather",
  "description": "Look up the weather",
  "version": "1.0.0",
  "entry": "index.js",
  "commands": ["weather"]
}
```

`entry` must be a relative `.js` file. `id` and commands cannot collide with
built-in slash commands.

```js
export function createPlugin() {
  return {
    id: "weather",
    slashCommands: [{ id: "weather", description: "Look up the weather" }],
    handleCommand(cmd, ctx) {
      if (!cmd.startsWith("/weather")) return false;
      ctx.reply("sunny");
      return true;
    },
  };
}
```

Installs are stored under `~/.grok/plugins/`. This loader runs in-process.
Only install code you trust.
