import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function loadCustomInstructions(workingDirectory: string = process.cwd()): string | null {
  try {
    let instructionsPath = path.join(workingDirectory, '.grok', 'GROK.md');
    
    if (fs.existsSync(instructionsPath)) {
      const customInstructions = fs.readFileSync(instructionsPath, 'utf-8');
      return customInstructions.trim();
    }
    
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
