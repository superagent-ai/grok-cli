import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import {
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptMessage,
  MCPRoot,
  MCPListResourcesResponse,
  MCPReadResourceResponse,
  MCPListPromptsResponse,
  MCPGetPromptResponse,
  MCPListRootsResponse,
  MCPCapabilities,
} from './types';
import { MCPSchemaValidator } from './schema-validator';

export class MCPService {
  private resources: Map<string, MCPResource> = new Map();
  private resourceContents: Map<string, MCPResourceContent> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();
  private promptTemplates: Map<string, MCPPromptMessage[]> = new Map();
  private roots: MCPRoot[] = [];
  private capabilities: MCPCapabilities = {
    resources: true,
    prompts: true,
    roots: true,
    tools: true,
  };

  constructor() {
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    // Initialize default roots
    this.roots = [
      { uri: `file://${process.cwd()}`, name: 'Current Directory' },
      { uri: `file://${os.homedir()}`, name: 'Home Directory' },
    ];

    // Initialize default resources
    this.registerResource({
      uri: 'grok://config',
      name: 'Grok CLI Configuration',
      description: 'Current configuration and settings for Grok CLI',
      mimeType: 'application/json',
      serverId: 'grok-local',
    });

    this.registerResource({
      uri: 'grok://history',
      name: 'Chat History',
      description: 'Recent chat history and interactions',
      mimeType: 'text/plain',
      serverId: 'grok-local',
    });

    this.registerResource({
      uri: 'grok://tools',
      name: 'Available Tools',
      description: 'List of available tools and their descriptions',
      mimeType: 'application/json',
      serverId: 'grok-local',
    });

    // Initialize default prompts
    this.registerPrompt(
      {
        name: 'code-review',
        description: 'Perform a code review on specified files',
        arguments: [
          {
            name: 'files',
            description: 'Comma-separated list of file paths to review',
            required: true,
          },
          {
            name: 'focus',
            description: 'Specific aspects to focus on (e.g., security, performance)',
            required: false,
          },
        ],
      },
      [
        {
          role: 'system',
          content: 'You are a code reviewer. Review the following files for best practices, potential issues, and improvements.',
        },
        {
          role: 'user',
          content: 'Please review the files: {{files}}. {{#if focus}}Focus on: {{focus}}.{{/if}}',
        },
      ]
    );

    this.registerPrompt(
      {
        name: 'refactor',
        description: 'Suggest refactoring improvements for code',
        arguments: [
          {
            name: 'file',
            description: 'File path to refactor',
            required: true,
          },
          {
            name: 'pattern',
            description: 'Design pattern or approach to apply',
            required: false,
          },
        ],
      },
      [
        {
          role: 'system',
          content: 'You are a refactoring expert. Suggest improvements to make code more maintainable, readable, and efficient.',
        },
        {
          role: 'user',
          content: 'Refactor the code in {{file}}. {{#if pattern}}Apply {{pattern}} pattern.{{/if}}',
        },
      ]
    );

    this.registerPrompt(
      {
        name: 'debug',
        description: 'Help debug an issue in the code',
        arguments: [
          {
            name: 'error',
            description: 'Error message or description',
            required: true,
          },
          {
            name: 'context',
            description: 'Additional context about the issue',
            required: false,
          },
        ],
      },
      [
        {
          role: 'system',
          content: 'You are a debugging assistant. Help identify and fix issues in code.',
        },
        {
          role: 'user',
          content: 'Help me debug this error: {{error}}. {{#if context}}Context: {{context}}.{{/if}}',
        },
      ]
    );
  }

  getCapabilities(): MCPCapabilities {
    return this.capabilities;
  }

  // Tools Management
  async listTools(): Promise<{ tools: any[] }> {
    const tools = [
      {
        name: 'view_file',
        description: 'View contents of a file or list directory contents',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file or directory to view'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'create_file',
        description: 'Create a new file with specified content',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path where to create the file'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'str_replace_editor',
        description: 'Replace specific text in a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            old_string: {
              type: 'string',
              description: 'Text to replace'
            },
            new_string: {
              type: 'string',
              description: 'Replacement text'
            }
          },
          required: ['path', 'old_string', 'new_string']
        }
      },
      {
        name: 'bash',
        description: 'Execute a bash command',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Bash command to execute'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'create_todo_list',
        description: 'Create a new todo list for planning and tracking tasks',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title for the todo list'
            },
            tasks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Initial tasks to add to the list'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'update_todo_list',
        description: 'Update existing todos in the todo list',
        inputSchema: {
          type: 'object',
          properties: {
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
                },
                required: ['id', 'content', 'status']
              },
              description: 'Updated tasks'
            }
          },
          required: ['tasks']
        }
      },
    ];

    return { tools };
  }

  async callTool(name: string, args: any): Promise<{ content: any[] }> {
    switch (name) {
      case 'view_file':
        return this.handleViewFile(args);
      case 'create_file':
        return this.handleCreateFile(args);
      case 'str_replace_editor':
        return this.handleStrReplaceEditor(args);
      case 'bash':
        return this.handleBash(args);
      case 'create_todo_list':
        return this.handleCreateTodoList(args);
      case 'update_todo_list':
        return this.handleUpdateTodoList(args);
      default:
        throw new Error(`Tool not found: ${name}`);
    }
  }

  private async handleViewFile(args: any): Promise<{ content: any[] }> {
    const filePath = args.path;
    if (!filePath) {
      throw new Error('Path parameter is required');
    }

    const absolutePath = path.resolve(filePath);
    if (!this.isPathAllowed(absolutePath)) {
      throw new Error('Path not allowed by MCP roots');
    }

    try {
      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        const files = await fs.readdir(absolutePath);
        return {
          content: [{
            type: 'text',
            text: `Directory contents of ${absolutePath}:\n${files.join('\n')}`
          }]
        };
      } else {
        const content = await fs.readFile(absolutePath, 'utf-8');
        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to read ${absolutePath}: ${error}`);
    }
  }

  private async handleCreateFile(args: any): Promise<{ content: any[] }> {
    const filePath = args.path;
    const content = args.content;
    
    if (!filePath || !content) {
      throw new Error('Both path and content parameters are required');
    }

    const absolutePath = path.resolve(filePath);
    if (!this.isPathAllowed(absolutePath)) {
      throw new Error('Path not allowed by MCP roots');
    }

    try {
      await fs.ensureDir(path.dirname(absolutePath));
      await fs.writeFile(absolutePath, content, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: `File created successfully: ${absolutePath}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create file ${absolutePath}: ${error}`);
    }
  }

  private async handleStrReplaceEditor(args: any): Promise<{ content: any[] }> {
    const filePath = args.path;
    const oldString = args.old_string;
    const newString = args.new_string;

    if (!filePath || !oldString || newString === undefined) {
      throw new Error('path, old_string, and new_string parameters are required');
    }

    const absolutePath = path.resolve(filePath);
    if (!this.isPathAllowed(absolutePath)) {
      throw new Error('Path not allowed by MCP roots');
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const newContent = content.replace(new RegExp(oldString, 'g'), newString);
      await fs.writeFile(absolutePath, newContent, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: `File updated successfully: ${absolutePath}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update file ${absolutePath}: ${error}`);
    }
  }

  private async handleBash(args: any): Promise<{ content: any[] }> {
    const command = args.command;
    if (!command) {
      throw new Error('Command parameter is required');
    }

    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: process.cwd(),
        timeout: 30000,
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      
      const output = stdout + (stderr ? `\nStderr: ${stderr}` : '');
      return {
        content: [{
          type: 'text',
          text: output || 'Command executed successfully with no output'
        }]
      };
    } catch (error: any) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  private async handleCreateTodoList(args: any): Promise<{ content: any[] }> {
    const title = args.title;
    const tasks = args.tasks || [];

    if (!title) {
      throw new Error('Title parameter is required');
    }

    const todoList = {
      title,
      tasks: tasks.map((task: string, index: number) => ({
        id: `task-${Date.now()}-${index}`,
        content: task,
        status: 'pending' as const
      }))
    };

    return {
      content: [{
        type: 'text',
        text: `Todo list "${title}" created with ${tasks.length} tasks`
      }]
    };
  }

  private async handleUpdateTodoList(args: any): Promise<{ content: any[] }> {
    const tasks = args.tasks;
    if (!tasks || !Array.isArray(tasks)) {
      throw new Error('Tasks parameter must be an array');
    }

    return {
      content: [{
        type: 'text',
        text: `Updated ${tasks.length} tasks in todo list`
      }]
    };
  }

  // Resource Management
  registerResource(resource: MCPResource): void {
    const validation = MCPSchemaValidator.validateResource(resource);
    if (!validation.valid) {
      throw new Error(`Invalid resource: ${validation.errors.join(', ')}`);
    }
    this.resources.set(resource.uri, resource);
  }

  setResourceContent(uri: string, content: string | Buffer, mimeType?: string): void {
    this.resourceContents.set(uri, {
      uri,
      content,
      mimeType: mimeType || this.resources.get(uri)?.mimeType,
    });
  }

  async listResources(cursor?: string): Promise<MCPListResourcesResponse> {
    const allResources = Array.from(this.resources.values());
    const pageSize = 100;
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const endIndex = Math.min(startIndex + pageSize, allResources.length);
    
    return {
      resources: allResources.slice(startIndex, endIndex),
      nextCursor: endIndex < allResources.length ? endIndex.toString() : undefined,
    };
  }

  async readResource(uri: string): Promise<MCPReadResourceResponse> {
    // Handle dynamic resources
    if (uri === 'grok://config') {
      const config = await this.getConfigResource();
      return { content: config };
    }

    if (uri === 'grok://history') {
      const history = await this.getHistoryResource();
      return { content: history };
    }

    if (uri === 'grok://tools') {
      const tools = await this.getToolsResource();
      return { content: tools };
    }

    // Handle file:// URIs
    if (uri.startsWith('file://')) {
      const filePath = uri.substring(7);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return {
          content: {
            uri,
            content,
            mimeType: this.getMimeType(filePath),
          },
        };
      } catch (error) {
        throw new Error(`Failed to read resource ${uri}: ${error}`);
      }
    }

    // Check static resources
    const content = this.resourceContents.get(uri);
    if (!content) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return { content };
  }

  private async getConfigResource(): Promise<MCPResourceContent> {
    const config = {
      workingDirectory: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
      grokModel: 'grok-3-latest',
      mcpEnabled: true,
      capabilities: this.capabilities,
    };

    return {
      uri: 'grok://config',
      content: JSON.stringify(config, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getHistoryResource(): Promise<MCPResourceContent> {
    // This would be populated from the actual chat history
    const history = 'Chat history will be populated here...';

    return {
      uri: 'grok://history',
      content: history,
      mimeType: 'text/plain',
    };
  }

  private async getToolsResource(): Promise<MCPResourceContent> {
    const tools = [
      {
        name: 'view_file',
        description: 'View contents of a file or list directory contents',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file or directory to view'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'create_file',
        description: 'Create a new file with specified content',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path where to create the file'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'str_replace_editor',
        description: 'Replace specific text in a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            old_string: {
              type: 'string',
              description: 'Text to replace'
            },
            new_string: {
              type: 'string',
              description: 'Replacement text'
            }
          },
          required: ['path', 'old_string', 'new_string']
        }
      },
      {
        name: 'bash',
        description: 'Execute a bash command',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Bash command to execute'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'create_todo_list',
        description: 'Create a new todo list for planning and tracking tasks',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title for the todo list'
            },
            tasks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Initial tasks to add to the list'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'update_todo_list',
        description: 'Update existing todos in the todo list',
        inputSchema: {
          type: 'object',
          properties: {
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
                },
                required: ['id', 'content', 'status']
              },
              description: 'Updated tasks'
            }
          },
          required: ['tasks']
        }
      },
    ];

    return {
      uri: 'grok://tools',
      content: JSON.stringify(tools, null, 2),
      mimeType: 'application/json',
    };
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.jsx': 'text/jsx',
      '.tsx': 'text/tsx',
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.h': 'text/x-c',
      '.hpp': 'text/x-c++',
      '.xml': 'application/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.toml': 'text/toml',
      '.ini': 'text/ini',
      '.sh': 'text/x-shellscript',
      '.bash': 'text/x-shellscript',
      '.zsh': 'text/x-shellscript',
      '.fish': 'text/x-shellscript',
      '.ps1': 'text/x-powershell',
      '.html': 'text/html',
      '.css': 'text/css',
      '.scss': 'text/x-scss',
      '.sass': 'text/x-sass',
      '.less': 'text/x-less',
    };

    return mimeTypes[ext] || 'text/plain';
  }

  // Prompt Management
  registerPrompt(prompt: MCPPrompt, template: MCPPromptMessage[]): void {
    const validation = MCPSchemaValidator.validatePrompt(prompt);
    if (!validation.valid) {
      throw new Error(`Invalid prompt: ${validation.errors.join(', ')}`);
    }
    this.prompts.set(prompt.name, prompt);
    this.promptTemplates.set(prompt.name, template);
  }

  async listPrompts(cursor?: string): Promise<MCPListPromptsResponse> {
    const allPrompts = Array.from(this.prompts.values());
    const pageSize = 100;
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const endIndex = Math.min(startIndex + pageSize, allPrompts.length);
    
    return {
      prompts: allPrompts.slice(startIndex, endIndex),
      nextCursor: endIndex < allPrompts.length ? endIndex.toString() : undefined,
    };
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPGetPromptResponse> {
    const prompt = this.prompts.get(name);
    const template = this.promptTemplates.get(name);

    if (!prompt || !template) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Process template with arguments
    const messages = template.map(msg => ({
      ...msg,
      content: this.processTemplate(msg.content, args || {}),
    }));

    return {
      description: prompt.description,
      messages,
    };
  }

  private processTemplate(template: string, args: Record<string, string>): string {
    // Simple template processing - replace {{variable}} with values
    let processed = template;

    // Handle conditionals {{#if variable}}...{{/if}}
    processed = processed.replace(/\{\{#if (\w+)\}\}(.*?)\{\{\/if\}\}/gs, (match, variable, content) => {
      return args[variable] ? content : '';
    });

    // Handle variable substitution
    processed = processed.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return args[variable] || '';
    });

    return processed.trim();
  }

  // Roots Management
  addRoot(root: MCPRoot): void {
    const validation = MCPSchemaValidator.validateRoot(root);
    if (!validation.valid) {
      throw new Error(`Invalid root: ${validation.errors.join(', ')}`);
    }
    
    // Check if root already exists
    const exists = this.roots.some(r => r.uri === root.uri);
    if (!exists) {
      this.roots.push(root);
    }
  }

  removeRoot(uri: string): void {
    this.roots = this.roots.filter(r => r.uri !== uri);
  }

  async listRoots(): Promise<MCPListRootsResponse> {
    return { roots: this.roots };
  }

  isPathAllowed(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    
    // Check if the path is within any of the allowed roots
    return this.roots.some(root => {
      if (root.uri.startsWith('file://')) {
        const rootPath = root.uri.substring(7);
        const absoluteRootPath = path.resolve(rootPath);
        return absolutePath.startsWith(absoluteRootPath);
      }
      return false;
    });
  }

  // Utility method to register file resources from a directory
  async registerDirectoryResources(dirPath: string, recursive: boolean = false): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          const uri = `file://${fullPath}`;
          this.registerResource({
            uri,
            name: entry.name,
            description: `File: ${fullPath}`,
            mimeType: this.getMimeType(fullPath),
            serverId: 'grok-local',
          });
        } else if (entry.isDirectory() && recursive) {
          await this.registerDirectoryResources(fullPath, recursive);
        }
      }
    } catch (error) {
      console.error(`Error registering directory resources: ${error}`);
    }
  }
}