import { describe, it, expect } from 'vitest';
import {
  isWordBoundary,
  findWordStart,
  findWordEnd,
  moveToPreviousWord,
  moveToNextWord,
  deleteWordBefore,
  deleteWordAfter,
  getTextPosition,
  moveToLineStart,
  moveToLineEnd,
  deleteCharBefore,
  deleteCharAfter,
  insertText,
} from '../../src/utils/text-utils';

describe('text-utils', () => {
  describe('isWordBoundary', () => {
    it('should return true for undefined character', () => {
      expect(isWordBoundary(undefined)).toBe(true);
    });

    it('should return true for whitespace', () => {
      expect(isWordBoundary(' ')).toBe(true);
      expect(isWordBoundary('\t')).toBe(true);
      expect(isWordBoundary('\n')).toBe(true);
    });

    it('should return true for non-word characters', () => {
      expect(isWordBoundary('.')).toBe(true);
      expect(isWordBoundary(',')).toBe(true);
      expect(isWordBoundary('!')).toBe(true);
      expect(isWordBoundary('@')).toBe(true);
    });

    it('should return false for word characters', () => {
      expect(isWordBoundary('a')).toBe(false);
      expect(isWordBoundary('Z')).toBe(false);
      expect(isWordBoundary('0')).toBe(false);
      expect(isWordBoundary('_')).toBe(false);
    });
  });

  describe('findWordStart', () => {
    it('should find word start in simple text', () => {
      const text = 'hello world';
      expect(findWordStart(text, 5)).toBe(0); // From end of 'hello'
      expect(findWordStart(text, 11)).toBe(6); // From end of 'world'
    });

    it('should handle position at start', () => {
      expect(findWordStart('hello', 0)).toBe(0);
    });

    it('should handle text with punctuation', () => {
      const text = 'hello, world!';
      expect(findWordStart(text, 6)).toBe(6); // After comma and space
      expect(findWordStart(text, 13)).toBe(13); // At end after exclamation
    });
  });

  describe('findWordEnd', () => {
    it('should find word end in simple text', () => {
      const text = 'hello world';
      expect(findWordEnd(text, 0)).toBe(5); // From start of 'hello'
      expect(findWordEnd(text, 6)).toBe(11); // From start of 'world'
    });

    it('should handle position at end', () => {
      const text = 'hello';
      expect(findWordEnd(text, text.length)).toBe(text.length);
    });

    it('should handle text with punctuation', () => {
      const text = 'hello, world!';
      expect(findWordEnd(text, 0)).toBe(5); // From start
      expect(findWordEnd(text, 7)).toBe(12); // From 'world'
    });
  });

  describe('moveToPreviousWord', () => {
    it('should move to previous word', () => {
      const text = 'hello world test';
      expect(moveToPreviousWord(text, 16)).toBe(12); // test -> world
      expect(moveToPreviousWord(text, 11)).toBe(6); // world -> hello
    });

    it('should handle position at start', () => {
      expect(moveToPreviousWord('hello', 0)).toBe(0);
    });

    it('should skip multiple spaces', () => {
      const text = 'hello   world';
      expect(moveToPreviousWord(text, 13)).toBe(8);
    });
  });

  describe('moveToNextWord', () => {
    it('should move to next word', () => {
      const text = 'hello world test';
      expect(moveToNextWord(text, 0)).toBe(6); // hello -> world
      expect(moveToNextWord(text, 6)).toBe(12); // world -> test
    });

    it('should handle position at end', () => {
      const text = 'hello';
      expect(moveToNextWord(text, text.length)).toBe(text.length);
    });

    it('should skip multiple spaces', () => {
      const text = 'hello   world';
      expect(moveToNextWord(text, 0)).toBe(8);
    });
  });

  describe('deleteWordBefore', () => {
    it('should delete word before cursor', () => {
      const result = deleteWordBefore('hello world', 11);
      expect(result.text).toBe('hello ');
      expect(result.position).toBe(6);
    });

    it('should handle position at start', () => {
      const result = deleteWordBefore('hello', 0);
      expect(result.text).toBe('hello');
      expect(result.position).toBe(0);
    });

    it('should delete with spaces', () => {
      const result = deleteWordBefore('hello   world', 13);
      expect(result.text).toBe('hello   ');
      expect(result.position).toBe(8);
    });
  });

  describe('deleteWordAfter', () => {
    it('should delete word after cursor', () => {
      const result = deleteWordAfter('hello world', 0);
      expect(result.text).toBe('world');
      expect(result.position).toBe(0);
    });

    it('should handle position at end', () => {
      const text = 'hello';
      const result = deleteWordAfter(text, text.length);
      expect(result.text).toBe(text);
      expect(result.position).toBe(text.length);
    });
  });

  describe('getTextPosition', () => {
    it('should get position in single line', () => {
      const pos = getTextPosition('hello world', 6);
      expect(pos.index).toBe(6);
      expect(pos.line).toBe(0);
      expect(pos.column).toBe(6);
    });

    it('should get position in multi-line text', () => {
      const text = 'hello\nworld\ntest';
      const pos = getTextPosition(text, 12); // 'w' in 'world'
      expect(pos.index).toBe(12);
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(0);
    });
  });

  describe('moveToLineStart', () => {
    it('should move to line start in single line', () => {
      expect(moveToLineStart('hello world', 6)).toBe(0);
    });

    it('should move to line start in multi-line', () => {
      const text = 'hello\nworld\ntest';
      expect(moveToLineStart(text, 12)).toBe(12);
      expect(moveToLineStart(text, 8)).toBe(6);
    });
  });

  describe('moveToLineEnd', () => {
    it('should move to line end in single line', () => {
      const text = 'hello world';
      expect(moveToLineEnd(text, 0)).toBe(text.length);
    });

    it('should move to line end in multi-line', () => {
      const text = 'hello\nworld\ntest';
      expect(moveToLineEnd(text, 0)).toBe(5);
      expect(moveToLineEnd(text, 6)).toBe(11);
    });
  });

  describe('deleteCharBefore', () => {
    it('should delete regular character', () => {
      const result = deleteCharBefore('hello', 5);
      expect(result.text).toBe('hell');
      expect(result.position).toBe(4);
    });

    it('should handle position at start', () => {
      const result = deleteCharBefore('hello', 0);
      expect(result.text).toBe('hello');
      expect(result.position).toBe(0);
    });

    it('should handle Unicode surrogate pairs', () => {
      const emoji = '😀'; // This is a surrogate pair
      const text = `hello${emoji}world`;
      const result = deleteCharBefore(text, 7); // After emoji
      expect(result.text).toBe('helloworld');
      expect(result.position).toBe(5);
    });
  });

  describe('deleteCharAfter', () => {
    it('should delete regular character', () => {
      const result = deleteCharAfter('hello', 0);
      expect(result.text).toBe('ello');
      expect(result.position).toBe(0);
    });

    it('should handle position at end', () => {
      const text = 'hello';
      const result = deleteCharAfter(text, text.length);
      expect(result.text).toBe(text);
      expect(result.position).toBe(text.length);
    });

    it('should handle Unicode surrogate pairs', () => {
      const emoji = '😀';
      const text = `hello${emoji}world`;
      const result = deleteCharAfter(text, 5); // Before emoji
      expect(result.text).toBe('helloworld');
      expect(result.position).toBe(5);
    });
  });

  describe('insertText', () => {
    it('should insert text at position', () => {
      const result = insertText('hello world', 6, 'beautiful ');
      expect(result.text).toBe('hello beautiful world');
      expect(result.position).toBe(16);
    });

    it('should insert at start', () => {
      const result = insertText('world', 0, 'hello ');
      expect(result.text).toBe('hello world');
      expect(result.position).toBe(6);
    });

    it('should insert at end', () => {
      const result = insertText('hello', 5, ' world');
      expect(result.text).toBe('hello world');
      expect(result.position).toBe(11);
    });
  });
});
