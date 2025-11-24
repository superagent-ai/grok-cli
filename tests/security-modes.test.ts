/**
 * Tests for Security Mode Manager
 */
import { SecurityModeManager, getSecurityModeManager, resetSecurityModeManager } from '../src/security/security-modes';

describe('SecurityModeManager', () => {
  let manager: SecurityModeManager;

  beforeEach(() => {
    resetSecurityModeManager();
    manager = new SecurityModeManager(process.cwd(), 'suggest');
  });

  describe('Mode Management', () => {
    it('should default to suggest mode', () => {
      expect(manager.getMode()).toBe('suggest');
    });

    it('should change mode', () => {
      manager.setMode('auto-edit');
      expect(manager.getMode()).toBe('auto-edit');

      manager.setMode('full-auto');
      expect(manager.getMode()).toBe('full-auto');
    });

    it('should reject invalid modes', () => {
      expect(() => manager.setMode('invalid' as any)).toThrow('Invalid security mode');
    });
  });

  describe('Suggest Mode', () => {
    beforeEach(() => {
      manager.setMode('suggest');
    });

    it('should require approval for file writes', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.fileWrite).toBe(true);
    });

    it('should require approval for bash commands', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.bashCommand).toBe(true);
    });

    it('should not require approval for file reads', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.fileRead).toBe(false);
    });
  });

  describe('Auto-Edit Mode', () => {
    beforeEach(() => {
      manager.setMode('auto-edit');
    });

    it('should not require approval for file writes', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.fileWrite).toBe(false);
    });

    it('should still require approval for bash commands', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.bashCommand).toBe(true);
    });

    it('should require approval for file deletion', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.fileDelete).toBe(true);
    });
  });

  describe('Full-Auto Mode', () => {
    beforeEach(() => {
      manager.setMode('full-auto');
    });

    it('should not require approval for file operations', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.fileWrite).toBe(false);
      expect(config.requireApproval.fileCreate).toBe(false);
      expect(config.requireApproval.fileDelete).toBe(false);
    });

    it('should not require approval for bash commands', () => {
      const config = manager.getConfig();
      expect(config.requireApproval.bashCommand).toBe(false);
    });

    it('should disable network by default', () => {
      const config = manager.getConfig();
      expect(config.networkDisabled).toBe(true);
    });
  });

  describe('Operation Validation', () => {
    it('should block dangerous commands', () => {
      const result = manager.validateOperation({
        type: 'bash',
        resource: 'rm -rf /',
        description: 'Delete all files',
        risk: 'high',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should block access to blocked paths', () => {
      const result = manager.validateOperation({
        type: 'file-write',
        resource: '/etc/passwd',
        description: 'Write to passwd',
        risk: 'high',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should allow safe operations', () => {
      const result = manager.validateOperation({
        type: 'file-read',
        resource: './package.json',
        description: 'Read package.json',
        risk: 'low',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Risk Assessment', () => {
    it('should rate file deletion as high risk', () => {
      const risk = manager.getRiskLevel({
        type: 'file-delete',
        resource: 'test.txt',
        description: 'Delete file',
        risk: 'high',
      });
      expect(risk).toBe('high');
    });

    it('should rate rm commands as high risk', () => {
      const risk = manager.getRiskLevel({
        type: 'bash',
        resource: 'rm test.txt',
        description: 'Remove file',
        risk: 'high',
      });
      expect(risk).toBe('high');
    });

    it('should rate sudo commands as high risk', () => {
      const risk = manager.getRiskLevel({
        type: 'bash',
        resource: 'sudo apt-get update',
        description: 'Update packages',
        risk: 'high',
      });
      expect(risk).toBe('high');
    });

    it('should rate npm commands as medium risk', () => {
      const risk = manager.getRiskLevel({
        type: 'bash',
        resource: 'npm install',
        description: 'Install packages',
        risk: 'medium',
      });
      expect(risk).toBe('medium');
    });

    it('should rate ls commands as low risk', () => {
      const risk = manager.getRiskLevel({
        type: 'bash',
        resource: 'ls -la',
        description: 'List files',
        risk: 'low',
      });
      expect(risk).toBe('low');
    });
  });

  describe('Approval Recording', () => {
    it('should remember approved operations when requested', () => {
      const request = {
        type: 'file-write' as const,
        resource: 'test.txt',
        description: 'Test write',
        risk: 'low' as const,
      };

      manager.recordApproval(request, { approved: true, remember: true });

      // Now it shouldn't require approval
      expect(manager.requiresApproval(request)).toBe(false);
    });

    it('should remember denied operations when requested', () => {
      const request = {
        type: 'bash' as const,
        resource: 'dangerous-command',
        description: 'Dangerous',
        risk: 'high' as const,
      };

      manager.recordApproval(request, { approved: false, remember: true });

      // Should still require approval (and will be denied)
      expect(manager.requiresApproval(request)).toBe(true);
    });

    it('should clear session approvals', () => {
      const request = {
        type: 'file-write' as const,
        resource: 'test.txt',
        description: 'Test',
        risk: 'low' as const,
      };

      manager.recordApproval(request, { approved: true, remember: true });
      manager.clearSessionApprovals();

      // Should require approval again in suggest mode
      manager.setMode('suggest');
      expect(manager.requiresApproval(request)).toBe(true);
    });
  });

  describe('Path Management', () => {
    it('should add blocked paths', () => {
      manager.addBlockedPath('/custom/blocked/path');
      const config = manager.getConfig();
      expect(config.blockedPaths).toContain('/custom/blocked/path');
    });

    it('should add allowed directories', () => {
      manager.addAllowedDirectory('/custom/allowed/dir');
      const config = manager.getConfig();
      expect(config.allowedDirectories).toContain('/custom/allowed/dir');
    });
  });
});
