import { OrchestrationDatabase, type Prompt } from './database.js';

export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
  description?: string;
}

export class PromptLibrary {
  private db: OrchestrationDatabase;
  private templates: Map<string, PromptTemplate> = new Map();

  constructor(db: OrchestrationDatabase) {
    this.db = db;
  }

  /**
   * Initialize library with pre-loaded templates
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
    await this.loadDefaultTemplates();
  }

  /**
   * Load default prompt templates
   */
  private async loadDefaultTemplates(): Promise<void> {
    const defaultTemplates: PromptTemplate[] = [
      {
        name: 'code-review',
        description: 'Comprehensive code review with security and quality analysis',
        variables: ['code', 'language', 'focus'],
        template: `Please perform a comprehensive code review of the following {{language}} code.

Code to review:
\`\`\`{{language}}
{{code}}
\`\`\`

Focus areas: {{focus}}

Please provide:
1. Code quality assessment
2. Security vulnerabilities
3. Performance considerations
4. Best practices violations
5. Suggested improvements

Format your response with clear sections and actionable recommendations.`,
      },
      {
        name: 'documentation-generator',
        description: 'Generate comprehensive documentation for code',
        variables: ['code', 'language', 'audience'],
        template: `Generate comprehensive documentation for the following {{language}} code.

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Target audience: {{audience}}

Please include:
1. Overview and purpose
2. API/Function documentation
3. Usage examples
4. Parameter descriptions
5. Return value documentation
6. Edge cases and error handling

Use clear, professional markdown formatting.`,
      },
      {
        name: 'bug-fix',
        description: 'Analyze and fix bugs in code',
        variables: ['code', 'language', 'error', 'context'],
        template: `Help me fix a bug in the following {{language}} code.

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Error/Issue:
{{error}}

Context:
{{context}}

Please:
1. Analyze the bug
2. Explain the root cause
3. Provide a fix with explanation
4. Suggest tests to prevent regression
5. Recommend best practices to avoid similar issues`,
      },
      {
        name: 'refactor',
        description: 'Refactor code for better quality and maintainability',
        variables: ['code', 'language', 'goals'],
        template: `Please refactor the following {{language}} code.

Current code:
\`\`\`{{language}}
{{code}}
\`\`\`

Refactoring goals: {{goals}}

Please provide:
1. Refactored code
2. Explanation of changes
3. Benefits of the refactoring
4. Any trade-offs or considerations
5. Migration steps if applicable`,
      },
      {
        name: 'test-generator',
        description: 'Generate comprehensive test cases',
        variables: ['code', 'language', 'framework'],
        template: `Generate comprehensive test cases for the following {{language}} code.

Code to test:
\`\`\`{{language}}
{{code}}
\`\`\`

Testing framework: {{framework}}

Please provide:
1. Unit tests covering all functions/methods
2. Edge case tests
3. Error handling tests
4. Integration tests if applicable
5. Test coverage explanation

Include clear test descriptions and assertions.`,
      },
      {
        name: 'security-audit',
        description: 'Perform security audit and vulnerability analysis',
        variables: ['code', 'language', 'deployment'],
        template: `Perform a security audit of the following {{language}} code.

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Deployment environment: {{deployment}}

Please analyze:
1. Security vulnerabilities (OWASP Top 10)
2. Authentication/authorization issues
3. Input validation
4. Data exposure risks
5. Dependency vulnerabilities
6. Security best practices violations

Provide severity ratings and remediation steps.`,
      },
      {
        name: 'performance-optimization',
        description: 'Optimize code for better performance',
        variables: ['code', 'language', 'bottleneck', 'constraints'],
        template: `Optimize the following {{language}} code for better performance.

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Known bottleneck: {{bottleneck}}
Constraints: {{constraints}}

Please provide:
1. Performance analysis
2. Identified bottlenecks
3. Optimized code
4. Performance improvements (quantified if possible)
5. Trade-offs and considerations
6. Benchmarking suggestions`,
      },
      {
        name: 'architecture-design',
        description: 'Design system architecture and components',
        variables: ['requirements', 'scale', 'constraints', 'technologies'],
        template: `Design a system architecture based on the following requirements.

Requirements:
{{requirements}}

Expected scale: {{scale}}
Constraints: {{constraints}}
Preferred technologies: {{technologies}}

Please provide:
1. High-level architecture diagram (in text/ASCII)
2. Component breakdown
3. Data flow
4. Technology stack recommendations
5. Scalability considerations
6. Security architecture
7. Deployment strategy

Use clear diagrams and explanations.`,
      },
    ];

    // Save templates to database
    for (const template of defaultTemplates) {
      const prompt: Prompt = {
        name: template.name,
        template: template.template,
        variables: JSON.stringify(template.variables),
        description: template.description,
      };

      this.db.savePrompt(prompt);
      this.templates.set(template.name, template);
    }
  }

  /**
   * Get a prompt template by name
   */
  getTemplate(name: string): PromptTemplate | undefined {
    // Try cache first
    if (this.templates.has(name)) {
      return this.templates.get(name);
    }

    // Load from database
    const prompt = this.db.getPrompt(name);
    if (!prompt) return undefined;

    const template: PromptTemplate = {
      name: prompt.name,
      template: prompt.template,
      variables: JSON.parse(prompt.variables),
      description: prompt.description,
    };

    this.templates.set(name, template);
    return template;
  }

  /**
   * Render a template with variables
   */
  render(templateName: string, variables: Record<string, string>): string {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Validate required variables
    const missingVars = template.variables.filter((v) => !(v in variables));
    if (missingVars.length > 0) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Replace variables in template
    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, value);
    }

    return rendered;
  }

  /**
   * Add or update a template
   */
  addTemplate(template: PromptTemplate): void {
    const prompt: Prompt = {
      name: template.name,
      template: template.template,
      variables: JSON.stringify(template.variables),
      description: template.description,
    };

    this.db.savePrompt(prompt);
    this.templates.set(template.name, template);
  }

  /**
   * Delete a template
   */
  deleteTemplate(name: string): void {
    this.db.deletePrompt(name);
    this.templates.delete(name);
  }

  /**
   * List all templates
   */
  listTemplates(): PromptTemplate[] {
    const prompts = this.db.getAllPrompts();

    return prompts.map((prompt) => ({
      name: prompt.name,
      template: prompt.template,
      variables: JSON.parse(prompt.variables),
      description: prompt.description,
    }));
  }

  /**
   * Get template variables
   */
  getTemplateVariables(templateName: string): string[] {
    const template = this.getTemplate(templateName);
    return template ? template.variables : [];
  }

  /**
   * Extract variables from a template string
   */
  static extractVariables(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;

    while ((match = regex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Validate template syntax
   */
  static validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for balanced braces
    const openBraces = (template.match(/\{\{/g) || []).length;
    const closeBraces = (template.match(/\}\}/g) || []).length;

    if (openBraces !== closeBraces) {
      errors.push('Unbalanced template braces');
    }

    // Check for invalid variable names
    const variables = this.extractVariables(template);
    for (const variable of variables) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable)) {
        errors.push(`Invalid variable name: ${variable}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
