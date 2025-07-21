# MCP Usage Examples

This file demonstrates how to use the Model Context Protocol features in Grok CLI.

## Working with Resources

### List all available resources
```
User: List all MCP resources
Grok: I'll list all available MCP resources for you.
[Lists resources including grok://config, grok://history, grok://tools]
```

### Read a specific resource
```
User: Read the grok://config resource
Grok: I'll read the configuration resource for you.
[Shows current configuration with working directory, platform, etc.]
```

### Register new resources
```
User: Register all TypeScript files in the src directory as resources
Grok: I'll register all TypeScript files in the src directory as MCP resources.
[Registers files and confirms completion]
```

## Working with Prompts

### List available prompts
```
User: Show me all available MCP prompts
Grok: I'll list all available MCP prompts.
[Lists code-review, refactor, and debug prompts with descriptions]
```

### Use a prompt
```
User: Use the code-review prompt on src/index.ts focusing on security
Grok: I'll use the code-review prompt to review src/index.ts with a focus on security.
[Performs code review with security focus]
```

### Get prompt details
```
User: Get the refactor prompt with file=src/utils.ts and pattern=singleton
Grok: I'll get the refactor prompt configured for src/utils.ts with singleton pattern.
[Shows the prompt messages with arguments filled in]
```

## Working with Roots

### List current roots
```
User: Show me the MCP roots
Grok: I'll list all configured MCP roots.
[Shows current directory and home directory as roots]
```

### Add a new root
```
User: Add /usr/local/projects as a new MCP root called "Projects"
Grok: I'll add /usr/local/projects as a new MCP root.
[Confirms root addition]
```

## Advanced Usage

### Combining MCP features
```
User: Register all files in the current root as resources, then use the code-review prompt on any JavaScript files
Grok: I'll first register all files in the current directory as resources, then perform a code review on JavaScript files.
[Executes both operations in sequence]
```

### Resource discovery
```
User: Find and read all configuration-related resources
Grok: I'll search for and read configuration-related resources.
[Lists and reads relevant resources like grok://config and any config files]
```

## Custom Resources

You can create custom resources programmatically:

```
User: Create a new resource called grok://project-stats with project statistics
Grok: I'll create a new MCP resource with project statistics.
[Creates resource with file counts, sizes, and other stats]
```

## Integration with Existing Tools

MCP features work seamlessly with existing Grok CLI tools:

```
User: Read the package.json file as a resource, then create a todo list based on missing scripts
Grok: I'll read package.json as an MCP resource and create a todo list for missing scripts.
[Reads file and creates appropriate todos]
```