/**
 * Tests for the RAG-based Tool Selection module
 *
 * These tests verify that the tool selector correctly:
 * - Classifies queries into appropriate categories
 * - Selects relevant tools based on semantic similarity
 * - Reduces token usage while maintaining accuracy
 */

import {
  ToolSelector,
  getToolSelector,
  selectRelevantTools,
  QueryClassification,
  ToolCategory
} from '../src/tools/tool-selector';
import { GrokTool } from '../src/grok/client';

// Mock tools for testing
const mockTools: GrokTool[] = [
  {
    type: 'function',
    function: {
      name: 'view_file',
      description: 'View contents of a file or list directory contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to file' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file with specified content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to file' },
          content: { type: 'string', description: 'Content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'str_replace_editor',
      description: 'Replace specific text in a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_str: { type: 'string' },
          new_str: { type: 'string' }
        },
        required: ['path', 'old_str', 'new_str']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search for text content or files',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git',
      description: 'Perform git operations',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', description: 'Git operation' }
        },
        required: ['operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pdf',
      description: 'Read and extract content from PDF files',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to PDF' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diagram',
      description: 'Generate diagrams and flowcharts',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', description: 'Diagram type' }
        },
        required: ['operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp__custom__tool',
      description: 'Custom MCP tool for database queries',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Database query' }
        },
        required: ['query']
      }
    }
  }
];

describe('ToolSelector', () => {
  let selector: ToolSelector;

  beforeEach(() => {
    selector = new ToolSelector();
  });

  describe('classifyQuery', () => {
    it('should classify file reading queries correctly', () => {
      const result = selector.classifyQuery('Show me the contents of package.json');

      expect(result.categories).toContain('file_read');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify file editing queries correctly', () => {
      const result = selector.classifyQuery('Edit the config file to change the port');

      expect(result.categories).toContain('file_write');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify search queries correctly', () => {
      const result = selector.classifyQuery('Find all files containing "TODO"');

      expect(result.categories).toContain('file_search');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify system/bash queries correctly', () => {
      const result = selector.classifyQuery('Run npm install and build the project');

      expect(result.categories).toContain('system');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify git queries correctly', () => {
      const result = selector.classifyQuery('Commit my changes and push to the remote');

      expect(result.categories).toContain('git');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify web search queries correctly', () => {
      const result = selector.classifyQuery('Search the web for latest React documentation');

      expect(result.categories).toContain('web');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect when multiple tools might be needed', () => {
      const result = selector.classifyQuery('Read the file and then edit it to fix the bug');

      expect(result.requiresMultipleTools).toBe(true);
    });

    it('should return default categories for ambiguous queries', () => {
      const result = selector.classifyQuery('Hello');

      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('selectTools', () => {
    it('should select file tools for file operations', () => {
      const result = selector.selectTools('Show me the package.json file', mockTools);

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('view_file');
      expect(result.selectedTools.length).toBeLessThanOrEqual(15);
    });

    it('should select edit tools for editing queries', () => {
      const result = selector.selectTools('Update the configuration in config.ts', mockTools);

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('str_replace_editor');
    });

    it('should select search tools for search queries', () => {
      const result = selector.selectTools('Find all TypeScript files with errors', mockTools);

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('search');
    });

    it('should select bash for command execution', () => {
      const result = selector.selectTools('Run the test suite', mockTools);

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('bash');
    });

    it('should select git tools for version control', () => {
      const result = selector.selectTools('Check git status and diff', mockTools);

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('git');
    });

    it('should select web tools for web queries', () => {
      const result = selector.selectTools('Search online for TypeScript best practices', mockTools);

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('web_search');
    });

    it('should always include core tools', () => {
      const result = selector.selectTools('Something random', mockTools, {
        alwaysInclude: ['view_file', 'bash']
      });

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).toContain('view_file');
      expect(toolNames).toContain('bash');
    });

    it('should respect maxTools limit', () => {
      const result = selector.selectTools('Do everything', mockTools, {
        maxTools: 3
      });

      expect(result.selectedTools.length).toBeLessThanOrEqual(3);
    });

    it('should calculate token savings', () => {
      const result = selector.selectTools('Show me a file', mockTools, {
        maxTools: 3
      });

      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.reducedTokens).toBeLessThan(result.originalTokens);
    });

    it('should filter by categories when specified', () => {
      const result = selector.selectTools('Do something', mockTools, {
        includeCategories: ['file_read', 'file_search']
      });

      const toolNames = result.selectedTools.map(t => t.function.name);

      // Should include file read/search tools
      expect(toolNames.some(n => ['view_file', 'search'].includes(n))).toBe(true);

      // Should NOT include git, web, etc.
      expect(toolNames).not.toContain('git');
      expect(toolNames).not.toContain('web_search');
    });

    it('should exclude categories when specified', () => {
      const result = selector.selectTools('Do something', mockTools, {
        excludeCategories: ['git', 'web']
      });

      const toolNames = result.selectedTools.map(t => t.function.name);
      expect(toolNames).not.toContain('git');
      expect(toolNames).not.toContain('web_search');
    });
  });

  describe('registerMCPTool', () => {
    it('should register MCP tools for better matching', () => {
      const mcpTool: GrokTool = {
        type: 'function',
        function: {
          name: 'mcp__database__query',
          description: 'Execute SQL queries on the database',
          parameters: {
            type: 'object',
            properties: {
              sql: { type: 'string' }
            },
            required: ['sql']
          }
        }
      };

      selector.registerMCPTool(mcpTool);
      const metadata = selector.getToolMetadata('mcp__database__query');

      expect(metadata).toBeDefined();
      expect(metadata?.category).toBe('mcp');
      expect(metadata?.keywords).toContain('database');
    });
  });
});

describe('getToolSelector', () => {
  it('should return a singleton instance', () => {
    const selector1 = getToolSelector();
    const selector2 = getToolSelector();

    expect(selector1).toBe(selector2);
  });
});

describe('selectRelevantTools', () => {
  it('should be a convenient wrapper for tool selection', () => {
    const result = selectRelevantTools('Read package.json', mockTools, 5);

    expect(result.selectedTools.length).toBeLessThanOrEqual(5);
    expect(result.classification).toBeDefined();
  });
});

describe('Query Classification Scenarios', () => {
  let selector: ToolSelector;

  beforeEach(() => {
    selector = new ToolSelector();
  });

  const testCases: Array<{
    query: string;
    expectedCategories: ToolCategory[];
    description: string;
  }> = [
    {
      query: 'Show me the README.md file',
      expectedCategories: ['file_read'],
      description: 'Simple file reading'
    },
    {
      query: 'Create a new component called Button.tsx',
      expectedCategories: ['file_write'],
      description: 'File creation'
    },
    {
      query: 'Fix the typo in the header component',
      expectedCategories: ['file_write'],
      description: 'File fixing/editing'
    },
    {
      query: 'Where is the authentication logic?',
      expectedCategories: ['file_search'],
      description: 'Code location search'
    },
    {
      query: 'Run the linter and fix any issues',
      expectedCategories: ['system'],
      description: 'Command execution'
    },
    {
      query: 'Commit all changes with message "feat: add login"',
      expectedCategories: ['git'],
      description: 'Git operations'
    },
    {
      query: 'What is the latest version of React?',
      expectedCategories: ['web'],
      description: 'Web information query'
    },
    {
      query: 'Read the PDF document and summarize it',
      expectedCategories: ['document'],
      description: 'Document processing'
    },
    {
      query: 'Create a flowchart showing the data flow',
      expectedCategories: ['utility'],
      description: 'Diagram generation'
    },
    {
      query: 'Analyze the codebase structure',
      expectedCategories: ['codebase'],
      description: 'Codebase analysis'
    }
  ];

  testCases.forEach(({ query, expectedCategories, description }) => {
    it(`should classify "${description}" correctly`, () => {
      const result = selector.classifyQuery(query);

      const hasExpectedCategory = expectedCategories.some(
        cat => result.categories.includes(cat)
      );
      expect(hasExpectedCategory).toBe(true);
    });
  });
});

describe('Tool Selection Performance', () => {
  let selector: ToolSelector;

  beforeEach(() => {
    selector = new ToolSelector();
  });

  it('should complete tool selection in reasonable time', () => {
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      selector.selectTools('Read and edit the package.json file', mockTools);
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // 100 selections should complete in less than 1 second
    expect(totalTime).toBeLessThan(1000);
  });

  it('should handle large tool sets efficiently', () => {
    // Create a large set of tools
    const largeToolSet: GrokTool[] = [];
    for (let i = 0; i < 100; i++) {
      largeToolSet.push({
        type: 'function',
        function: {
          name: `tool_${i}`,
          description: `Tool number ${i} for various operations`,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      });
    }

    const startTime = Date.now();
    const result = selector.selectTools('Do something', largeToolSet, { maxTools: 10 });
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
    expect(result.selectedTools.length).toBeLessThanOrEqual(10);
  });
});
