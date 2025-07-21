import { GrokTool } from '../grok/client';

export const MCP_TOOLS: GrokTool[] = [
  {
    type: 'function',
    function: {
      name: 'mcp_list_resources',
      description: 'List available MCP resources',
      parameters: {
        type: 'object',
        properties: {
          cursor: {
            type: 'string',
            description: 'Pagination cursor for listing resources'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_read_resource',
      description: 'Read content from an MCP resource',
      parameters: {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description: 'URI of the resource to read (e.g., grok://config, file:///path/to/file)'
          }
        },
        required: ['uri']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_list_prompts',
      description: 'List available MCP prompts',
      parameters: {
        type: 'object',
        properties: {
          cursor: {
            type: 'string',
            description: 'Pagination cursor for listing prompts'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_get_prompt',
      description: 'Get an MCP prompt with optional arguments',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the prompt to retrieve'
          },
          arguments: {
            type: 'object',
            description: 'Arguments to pass to the prompt template',
            additionalProperties: { type: 'string' }
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_list_roots',
      description: 'List configured MCP roots (allowed file system paths)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_add_root',
      description: 'Add a new MCP root (allowed file system path)',
      parameters: {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description: 'URI of the root to add (e.g., file:///path/to/directory)'
          },
          name: {
            type: 'string',
            description: 'Optional friendly name for the root'
          }
        },
        required: ['uri']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_register_resource',
      description: 'Register a new MCP resource',
      parameters: {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description: 'URI for the resource (e.g., grok://my-resource)'
          },
          name: {
            type: 'string',
            description: 'Display name for the resource'
          },
          description: {
            type: 'string',
            description: 'Description of the resource'
          },
          content: {
            type: 'string',
            description: 'Content of the resource'
          },
          mimeType: {
            type: 'string',
            description: 'MIME type of the resource content'
          }
        },
        required: ['uri', 'name', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_register_directory',
      description: 'Register all files in a directory as MCP resources',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory'
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to include subdirectories recursively'
          }
        },
        required: ['path']
      }
    }
  }
];