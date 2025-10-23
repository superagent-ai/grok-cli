import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function loadCustomInstructions(workingDirectory: string = process.cwd()): string | null {
  try {
    // First, try the working directory
    let instructionsPath = path.join(workingDirectory, '.grok', 'GROK.md');
    
    if (fs.existsSync(instructionsPath)) {
      const customInstructions = fs.readFileSync(instructionsPath, 'utf-8');
      return customInstructions.trim();
    }
    
    // If not found, try the home directory
    instructionsPath = path.join(os.homedir(), '.grok', 'GROK.md');
    
    if (fs.existsSync(instructionsPath)) {
      const customInstructions = fs.readFileSync(instructionsPath, 'utf-8');
      return customInstructions.trim();
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to load custom instructions:', error);
    return null;
  }
}
