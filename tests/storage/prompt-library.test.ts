import { PromptLibrary } from '../../src/storage/prompt-library.js';
import { OrchestrationDatabase } from '../../src/storage/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

/**
 * Test suite for PromptLibrary
 *
 * Tests the prompt template system including:
 * - Template management
 * - Variable substitution
 * - Template validation
 * - Default templates
 */

describe('PromptLibrary', () => {
  let db: OrchestrationDatabase;
  let library: PromptLibrary;
  const testDbPath = path.join(homedir(), '.supergrok', 'test-prompt-library.db');

  beforeEach(async () => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new OrchestrationDatabase(testDbPath);
    await db.initialize();

    library = new PromptLibrary(db);
    await library.initialize();
  });

  afterEach(() => {
    db.close();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    it('should load default templates', () => {
      const templates = library.listTemplates();

      expect(templates.length).toBeGreaterThan(0);

      // Check for specific default templates
      const templateNames = templates.map((t) => t.name);
      expect(templateNames).toContain('code-review');
      expect(templateNames).toContain('documentation-generator');
      expect(templateNames).toContain('bug-fix');
    });

    it('should have 8 default templates', () => {
      const templates = library.listTemplates();
      expect(templates.length).toBe(8);
    });
  });

  describe('Template Management', () => {
    it('should get template by name', () => {
      const template = library.getTemplate('code-review');

      expect(template).toBeDefined();
      expect(template!.name).toBe('code-review');
      expect(template!.variables).toContain('code');
    });

    it('should return undefined for non-existent template', () => {
      const template = library.getTemplate('non-existent');
      expect(template).toBeUndefined();
    });

    it('should add custom template', () => {
      const customTemplate = {
        name: 'custom-template',
        template: 'This is a {{test}} template',
        variables: ['test'],
        description: 'Custom test template',
      };

      library.addTemplate(customTemplate);

      const retrieved = library.getTemplate('custom-template');
      expect(retrieved).toBeDefined();
      expect(retrieved!.template).toContain('{{test}}');
    });

    it('should update existing template', () => {
      const template1 = {
        name: 'test-template',
        template: 'Original {{var}}',
        variables: ['var'],
      };

      const template2 = {
        name: 'test-template',
        template: 'Updated {{var}}',
        variables: ['var'],
      };

      library.addTemplate(template1);
      library.addTemplate(template2);

      const retrieved = library.getTemplate('test-template');
      expect(retrieved!.template).toContain('Updated');
    });

    it('should delete template', () => {
      const template = {
        name: 'temp-template',
        template: 'Temporary',
        variables: [],
      };

      library.addTemplate(template);
      library.deleteTemplate('temp-template');

      const retrieved = library.getTemplate('temp-template');
      expect(retrieved).toBeUndefined();
    });

    it('should list all templates', () => {
      const templates = library.listTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('name');
      expect(templates[0]).toHaveProperty('template');
      expect(templates[0]).toHaveProperty('variables');
    });
  });

  describe('Template Rendering', () => {
    it('should render template with variables', () => {
      const template = {
        name: 'test-render',
        template: 'Hello {{name}}, you are {{age}} years old',
        variables: ['name', 'age'],
      };

      library.addTemplate(template);

      const rendered = library.render('test-render', {
        name: 'Alice',
        age: '25',
      });

      expect(rendered).toBe('Hello Alice, you are 25 years old');
    });

    it('should render template with multiple occurrences of same variable', () => {
      const template = {
        name: 'test-multi',
        template: '{{name}} said: "Hello, {{name}}!"',
        variables: ['name'],
      };

      library.addTemplate(template);

      const rendered = library.render('test-multi', { name: 'Bob' });

      expect(rendered).toBe('Bob said: "Hello, Bob!"');
    });

    it('should throw error for missing required variables', () => {
      const template = {
        name: 'test-required',
        template: 'Hello {{name}}',
        variables: ['name'],
      };

      library.addTemplate(template);

      expect(() => library.render('test-required', {})).toThrow(
        'Missing required variables'
      );
    });

    it('should throw error for non-existent template', () => {
      expect(() => library.render('non-existent', {})).toThrow(
        "Template 'non-existent' not found"
      );
    });
  });

  describe('Template Variables', () => {
    it('should get template variables', () => {
      const variables = library.getTemplateVariables('code-review');

      expect(variables).toContain('code');
      expect(variables).toContain('language');
    });

    it('should return empty array for non-existent template', () => {
      const variables = library.getTemplateVariables('non-existent');
      expect(variables).toEqual([]);
    });
  });

  describe('Variable Extraction', () => {
    it('should extract variables from template string', () => {
      const template = 'Hello {{name}}, your score is {{score}}';
      const variables = PromptLibrary.extractVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('score');
      expect(variables).toHaveLength(2);
    });

    it('should handle templates with no variables', () => {
      const template = 'Hello world';
      const variables = PromptLibrary.extractVariables(template);

      expect(variables).toHaveLength(0);
    });

    it('should handle duplicate variables', () => {
      const template = '{{name}} {{name}} {{name}}';
      const variables = PromptLibrary.extractVariables(template);

      expect(variables).toHaveLength(1);
      expect(variables[0]).toBe('name');
    });
  });

  describe('Template Validation', () => {
    it('should validate correct template', () => {
      const template = 'Hello {{name}}, you are {{age}} years old';
      const validation = PromptLibrary.validateTemplate(template);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect unbalanced braces', () => {
      const template = 'Hello {{name}, you are {{age}} years old';
      const validation = PromptLibrary.validateTemplate(template);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Unbalanced template braces');
    });

    it('should validate variable names', () => {
      const template = 'Valid: {{valid_name}}, {{name123}}';
      const validation = PromptLibrary.validateTemplate(template);

      expect(validation.valid).toBe(true);
    });

    it('should reject invalid variable names', () => {
      const template = 'Invalid: {{123invalid}}';
      const validation = PromptLibrary.validateTemplate(template);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Invalid variable name'))).toBe(true);
    });
  });

  describe('Default Templates', () => {
    const defaultTemplateNames = [
      'code-review',
      'documentation-generator',
      'bug-fix',
      'refactor',
      'test-generator',
      'security-audit',
      'performance-optimization',
      'architecture-design',
    ];

    defaultTemplateNames.forEach((name) => {
      it(`should have ${name} template`, () => {
        const template = library.getTemplate(name);
        expect(template).toBeDefined();
        expect(template!.variables.length).toBeGreaterThan(0);
      });
    });

    it('should have proper descriptions for default templates', () => {
      const templates = library.listTemplates();

      for (const template of templates) {
        expect(template.description).toBeDefined();
        expect(template.description!.length).toBeGreaterThan(0);
      }
    });
  });
});
