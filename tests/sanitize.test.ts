/**
 * Tests for sanitization utilities
 */
import {
  sanitizeFilePath,
  sanitizeCommandArg,
  sanitizeURL,
  sanitizeJSON,
  escapeRegex,
  sanitizeHTML,
  isAlphanumeric,
  truncateString,
  removeControlCharacters,
  sanitizePort,
} from '../src/utils/sanitize';

describe('sanitizeFilePath', () => {
  it('should accept valid paths', () => {
    expect(sanitizeFilePath('/home/user/file.txt')).toBe('/home/user/file.txt');
    expect(sanitizeFilePath('relative/path.js')).toBe('relative/path.js');
  });

  it('should reject paths with null bytes', () => {
    expect(() => sanitizeFilePath('/home/user\0/file.txt')).toThrow('null bytes');
  });

  it('should reject directory traversal attempts', () => {
    expect(() => sanitizeFilePath('../../../etc/passwd')).toThrow('dangerous pattern');
    expect(() => sanitizeFilePath('/home/../../../etc/passwd')).toThrow('dangerous pattern');
  });

  it('should reject empty paths', () => {
    expect(() => sanitizeFilePath('')).toThrow('empty');
    expect(() => sanitizeFilePath('   ')).toThrow('empty');
  });

  it('should reject absolute paths when not allowed', () => {
    expect(() => sanitizeFilePath('/etc/passwd', false)).toThrow('Absolute paths');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilePath('  /home/user/file.txt  ')).toBe('/home/user/file.txt');
  });
});

describe('sanitizeCommandArg', () => {
  it('should accept safe arguments', () => {
    expect(sanitizeCommandArg('hello')).toBe('hello');
    expect(sanitizeCommandArg('file.txt')).toBe('file.txt');
    expect(sanitizeCommandArg('/path/to/file')).toBe('/path/to/file');
  });

  it('should reject arguments with semicolons', () => {
    expect(() => sanitizeCommandArg('hello; rm -rf /')).toThrow('dangerous character');
  });

  it('should reject arguments with pipes', () => {
    expect(() => sanitizeCommandArg('cat file | bash')).toThrow('dangerous character');
  });

  it('should reject arguments with ampersands', () => {
    expect(() => sanitizeCommandArg('command & malicious')).toThrow('dangerous character');
  });

  it('should reject arguments with backticks', () => {
    expect(() => sanitizeCommandArg('`rm -rf /`')).toThrow('dangerous character');
  });

  it('should reject arguments with $( )', () => {
    expect(() => sanitizeCommandArg('$(rm -rf /)')).toThrow('dangerous character');
  });

  it('should reject arguments with ${ }', () => {
    expect(() => sanitizeCommandArg('${PATH}')).toThrow('dangerous character');
  });

  it('should reject null bytes', () => {
    expect(() => sanitizeCommandArg('hello\0world')).toThrow('null bytes');
  });
});

describe('sanitizeURL', () => {
  it('should accept valid HTTP URLs', () => {
    expect(sanitizeURL('http://example.com')).toBe('http://example.com/');
    expect(sanitizeURL('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
  });

  it('should reject invalid URLs', () => {
    expect(() => sanitizeURL('not-a-url')).toThrow('Invalid URL');
  });

  it('should reject disallowed protocols', () => {
    expect(() => sanitizeURL('ftp://example.com')).toThrow('not allowed');
  });

  it('should reject javascript: URLs', () => {
    expect(() => sanitizeURL('javascript:alert(1)')).toThrow('not allowed');
  });

  it('should accept custom allowed protocols', () => {
    expect(sanitizeURL('ftp://example.com', ['ftp', 'http', 'https'])).toBe('ftp://example.com/');
  });
});

describe('sanitizeJSON', () => {
  it('should parse valid JSON', () => {
    expect(sanitizeJSON('{"key": "value"}')).toEqual({ key: 'value' });
    expect(sanitizeJSON('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('should reject invalid JSON', () => {
    expect(() => sanitizeJSON('{invalid}')).toThrow('Invalid JSON');
    expect(() => sanitizeJSON('')).toThrow('non-empty');
  });
});

describe('escapeRegex', () => {
  it('should escape special regex characters', () => {
    expect(escapeRegex('hello.world')).toBe('hello\\.world');
    expect(escapeRegex('a*b+c?')).toBe('a\\*b\\+c\\?');
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
    expect(escapeRegex('(a|b)')).toBe('\\(a\\|b\\)');
  });

  it('should leave normal strings unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
  });
});

describe('sanitizeHTML', () => {
  it('should escape HTML entities', () => {
    expect(sanitizeHTML('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(sanitizeHTML('a & b')).toBe('a &amp; b');
  });

  it('should handle empty strings', () => {
    expect(sanitizeHTML('')).toBe('');
  });
});

describe('isAlphanumeric', () => {
  it('should return true for alphanumeric strings', () => {
    expect(isAlphanumeric('hello123')).toBe(true);
    expect(isAlphanumeric('ABC')).toBe(true);
  });

  it('should return false for strings with special characters', () => {
    expect(isAlphanumeric('hello!')).toBe(false);
    expect(isAlphanumeric('hello world')).toBe(false);
  });

  it('should allow specified additional characters', () => {
    expect(isAlphanumeric('hello-world', '-')).toBe(true);
    expect(isAlphanumeric('hello_world', '_')).toBe(true);
    expect(isAlphanumeric('hello-world_test', '-_')).toBe(true);
  });
});

describe('truncateString', () => {
  it('should truncate long strings', () => {
    expect(truncateString('hello world', 8)).toBe('hello...');
  });

  it('should not truncate short strings', () => {
    expect(truncateString('hello', 10)).toBe('hello');
  });

  it('should use custom ellipsis', () => {
    expect(truncateString('hello world', 9, '…')).toBe('hello wo…');
  });
});

describe('removeControlCharacters', () => {
  it('should remove control characters', () => {
    expect(removeControlCharacters('hello\x00world')).toBe('helloworld');
    expect(removeControlCharacters('test\x07beep')).toBe('testbeep');
  });

  it('should keep newlines and tabs', () => {
    expect(removeControlCharacters('hello\nworld\ttab')).toBe('hello\nworld\ttab');
  });
});

describe('sanitizePort', () => {
  it('should accept valid ports', () => {
    expect(sanitizePort(80)).toBe(80);
    expect(sanitizePort('443')).toBe(443);
    expect(sanitizePort(8080)).toBe(8080);
  });

  it('should reject invalid ports', () => {
    expect(() => sanitizePort(0)).toThrow('between 1 and 65535');
    expect(() => sanitizePort(70000)).toThrow('between 1 and 65535');
    expect(() => sanitizePort(-1)).toThrow('between 1 and 65535');
  });

  it('should reject non-numeric strings', () => {
    expect(() => sanitizePort('abc')).toThrow('must be a number');
  });
});
