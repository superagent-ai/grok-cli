import { MCPResource, MCPPrompt, MCPRoot } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class MCPSchemaValidator {
  private static readonly URI_PATTERN = /^[a-zA-Z0-9+.-]+:\/\/[^\s\/$.?#].[^\s]*$/;
  
  static validateResource(resource: MCPResource): ValidationResult {
    const errors: string[] = [];
    
    if (!resource.uri) {
      errors.push('URI is required');
    } else if (!this.URI_PATTERN.test(resource.uri)) {
      errors.push('Invalid URI format');
    }
    
    if (!resource.name) {
      errors.push('Name is required');
    }
    
    if (resource.name && resource.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }
    
    if (resource.description && resource.description.length > 500) {
      errors.push('Description must be 500 characters or less');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static validatePrompt(prompt: MCPPrompt): ValidationResult {
    const errors: string[] = [];
    
    if (!prompt.name) {
      errors.push('Name is required');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(prompt.name)) {
      errors.push('Name can only contain letters, numbers, underscores, and hyphens');
    }
    
    if (prompt.name && prompt.name.length > 50) {
      errors.push('Name must be 50 characters or less');
    }
    
    if (prompt.description && prompt.description.length > 500) {
      errors.push('Description must be 500 characters or less');
    }
    
    if (prompt.arguments) {
      prompt.arguments.forEach((arg, index) => {
        if (!arg.name) {
          errors.push(`Argument ${index}: name is required`);
        } else if (!/^[a-zA-Z0-9_-]+$/.test(arg.name)) {
          errors.push(`Argument ${index}: name can only contain letters, numbers, underscores, and hyphens`);
        }
        
        if (arg.description && arg.description.length > 200) {
          errors.push(`Argument ${index}: description must be 200 characters or less`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static validateRoot(root: MCPRoot): ValidationResult {
    const errors: string[] = [];
    
    if (!root.uri) {
      errors.push('URI is required');
    } else if (!this.URI_PATTERN.test(root.uri)) {
      errors.push('Invalid URI format');
    }
    
    if (root.name && root.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static validateMentionPrefix(text: string): ValidationResult {
    const errors: string[] = [];
    
    // Validate @ prefix usage (for tools/servers)
    const atMatches = text.match(/@(\w+)/g);
    if (atMatches) {
      atMatches.forEach(match => {
        const name = match.substring(1);
        if (name.length > 50) {
          errors.push(`Tool/server name "${name}" is too long (max 50 characters)`);
        }
      });
    }
    
    // Validate # prefix usage (for files/directories)
    const hashMatches = text.match(/#([\w\-./]+)/g);
    if (hashMatches) {
      hashMatches.forEach(match => {
        const path = match.substring(1);
        if (path.length > 200) {
          errors.push(`File path "${path}" is too long (max 200 characters)`);
        }
      });
    }
    
    // Validate / prefix usage (for prompts/resources)
    const slashMatches = text.match(/\/([\w\-]+)/g);
    if (slashMatches) {
      slashMatches.forEach(match => {
        const name = match.substring(1);
        if (name.length > 50) {
          errors.push(`Prompt/resource name "${name}" is too long (max 50 characters)`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}