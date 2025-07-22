# MCP (Model Context Protocol) Features

This document outlines the comprehensive MCP integration in Grok CLI.

## Overview

Grok CLI now fully supports the Model Context Protocol (MCP) with support for:
- **Resources** - Files, configurations, and data sources
- **Prompts** - Reusable prompt templates
- **Roots** - Allowed file system paths for security

## CLI Commands

### MCP Server Management
```bash
grok mcp list                    # List all configured MCP servers
grok mcp add <name> [options]    # Add a new MCP server
grok mcp remove <name>           # Remove an MCP server
grok mcp test <name>            # Test server connection
grok mcp status                 # Show detailed server status
```

### Resources
```bash
grok mcp resources list         # List all available resources
grok mcp resources read <uri>   # Read content from a resource
```

### Prompts
```bash
grok mcp prompts list           # List all available prompts
grok mcp prompts get <name>     # Get a specific prompt
```

### Roots
```bash
grok mcp roots list             # List configured file system roots
grok mcp roots add <uri>        # Add a new root directory
grok mcp roots remove <uri>     # Remove a root directory
```

### MCP Server Mode
```bash
grok mcp serve                  # Start Grok as an MCP server
```

## Interactive Commands

When using the interactive CLI, you can use these commands:

### Built-in MCP Commands
- `/resources` - List all available MCP resources
- `/prompts` - List all available MCP prompts  
- `/roots` - List all configured MCP roots
- `/read-resource <uri>` - Read content from an MCP resource
- `/get-prompt <name>` - Get an MCP prompt
- `/mcp` - Show MCP server status and tools

### Examples

```
/resources
/prompts
/get-prompt code-review --args files=src/main.ts,focus=security
/read-resource grok://config
```

## Available Resources

### Built-in Resources
- `grok://config` - Current Grok CLI configuration
- `grok://history` - Chat history and interactions
- `grok://tools` - List of available tools and descriptions

### File Resources
- Any file can be accessed via `file://` URIs within allowed roots

## Available Prompts

### Built-in Prompts
- **code-review**: Perform code reviews on specified files
- **refactor**: Suggest refactoring improvements for code
- **debug**: Help debug issues in code

## Security - Roots

Roots define allowed file system paths for security. Default roots:
- Current working directory
- Home directory

New roots can be added via CLI or interactive commands.

## Schema Validation

All MCP resources, prompts, and roots are validated against schema rules:
- URI format validation
- Name length limits
- Description length limits
- Argument format validation

## Usage Patterns

### Prefix Usage
- `@` - References tools/servers
- `#` - References files/directories  
- `/` - References prompts/resources

### Examples
```bash
# Using CLI commands
grok mcp resources list
grok mcp prompts get code-review --args files=src/main.ts

# Using interactive mode
/resources
/get-prompt code-review files=src/main.ts,focus=performance
```

## Development

The MCP implementation includes:
- Full JSON-RPC 2.0 protocol support
- Stdio-based server transport
- Comprehensive error handling
- Schema validation
- Dynamic resource discovery