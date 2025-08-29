import * as fs from 'fs';
import * as path from 'path';

export function loadCustomInstructions(workingDirectory: string = process.cwd()): string | null {
  try {
    const instructionsPath = path.join(workingDirectory, '.quietenable', 'QUIETENABLE.md');
    
    if (!fs.existsSync(instructionsPath)) {
      return null;
    }

    const customInstructions = fs.readFileSync(instructionsPath, 'utf-8');
    return customInstructions.trim();
  } catch (error) {
    console.warn('Failed to load custom instructions:', error);
    return null;
  }
}