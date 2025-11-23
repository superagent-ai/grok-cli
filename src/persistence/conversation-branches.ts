import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import { GrokMessage } from "../grok/client.js";

export interface ConversationBranch {
  id: string;
  name: string;
  parentId?: string;
  parentMessageIndex?: number;  // Fork point in parent
  messages: GrokMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface BranchTree {
  branch: ConversationBranch;
  children: BranchTree[];
}

/**
 * Conversation Branch Manager - Fork and merge conversation histories
 */
export class ConversationBranchManager extends EventEmitter {
  private branches: Map<string, ConversationBranch> = new Map();
  private currentBranchId: string = "main";
  private storagePath: string;

  constructor(sessionId?: string) {
    super();
    const baseDir = path.join(os.homedir(), ".grok", "branches");
    this.storagePath = sessionId
      ? path.join(baseDir, sessionId)
      : path.join(baseDir, "default");

    this.loadBranches();
  }

  private generateId(): string {
    return `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private loadBranches(): void {
    try {
      fs.ensureDirSync(this.storagePath);
      const files = fs.readdirSync(this.storagePath);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(this.storagePath, file);
        const branch = fs.readJsonSync(filePath) as ConversationBranch;
        branch.createdAt = new Date(branch.createdAt);
        branch.updatedAt = new Date(branch.updatedAt);
        this.branches.set(branch.id, branch);
      }

      // Create main branch if it doesn't exist
      if (!this.branches.has("main")) {
        this.createBranch("main", "Main conversation");
      }
    } catch (error) {
      // Create fresh main branch
      this.createBranch("main", "Main conversation");
    }
  }

  private saveBranch(branch: ConversationBranch): void {
    try {
      fs.ensureDirSync(this.storagePath);
      const filePath = path.join(this.storagePath, `${branch.id}.json`);
      fs.writeJsonSync(filePath, branch, { spaces: 2 });
    } catch (error) {
      // Ignore save errors
    }
  }

  private deleteBranchFile(branchId: string): void {
    try {
      const filePath = path.join(this.storagePath, `${branchId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Create a new branch
   */
  createBranch(
    id: string,
    name: string,
    parentId?: string,
    parentMessageIndex?: number
  ): ConversationBranch {
    let messages: GrokMessage[] = [];

    // Copy messages from parent up to fork point
    if (parentId) {
      const parent = this.branches.get(parentId);
      if (parent) {
        const endIndex = parentMessageIndex ?? parent.messages.length;
        messages = JSON.parse(JSON.stringify(parent.messages.slice(0, endIndex)));
      }
    }

    const branch: ConversationBranch = {
      id,
      name,
      parentId,
      parentMessageIndex,
      messages,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.branches.set(id, branch);
    this.saveBranch(branch);

    this.emit("branch:created", { id, name, parentId });

    return branch;
  }

  /**
   * Fork from current branch at current position
   */
  fork(name: string): ConversationBranch {
    const current = this.getCurrentBranch();
    const id = this.generateId();

    const branch = this.createBranch(
      id,
      name,
      this.currentBranchId,
      current.messages.length
    );

    this.currentBranchId = id;
    this.emit("branch:forked", { from: current.id, to: id, name });

    return branch;
  }

  /**
   * Fork from a specific message
   */
  forkFromMessage(name: string, messageIndex: number): ConversationBranch {
    const id = this.generateId();

    const branch = this.createBranch(
      id,
      name,
      this.currentBranchId,
      messageIndex
    );

    this.currentBranchId = id;
    this.emit("branch:forked", { from: this.currentBranchId, to: id, name, messageIndex });

    return branch;
  }

  /**
   * Switch to a branch
   */
  checkout(branchId: string): ConversationBranch | null {
    const branch = this.branches.get(branchId);
    if (!branch) {
      return null;
    }

    const previousBranch = this.currentBranchId;
    this.currentBranchId = branchId;

    this.emit("branch:checkout", { from: previousBranch, to: branchId });

    return branch;
  }

  /**
   * Get current branch
   */
  getCurrentBranch(): ConversationBranch {
    return this.branches.get(this.currentBranchId) || this.branches.get("main")!;
  }

  /**
   * Get current branch ID
   */
  getCurrentBranchId(): string {
    return this.currentBranchId;
  }

  /**
   * Get messages from current branch
   */
  getMessages(): GrokMessage[] {
    return this.getCurrentBranch().messages;
  }

  /**
   * Add message to current branch
   */
  addMessage(message: GrokMessage): void {
    const branch = this.getCurrentBranch();
    branch.messages.push(message);
    branch.updatedAt = new Date();
    this.saveBranch(branch);
  }

  /**
   * Set messages for current branch
   */
  setMessages(messages: GrokMessage[]): void {
    const branch = this.getCurrentBranch();
    branch.messages = messages;
    branch.updatedAt = new Date();
    this.saveBranch(branch);
  }

  /**
   * Merge a branch into current branch
   */
  merge(sourceBranchId: string, strategy: "append" | "replace" = "append"): boolean {
    const source = this.branches.get(sourceBranchId);
    const target = this.getCurrentBranch();

    if (!source || source.id === target.id) {
      return false;
    }

    if (strategy === "append") {
      // Find common ancestor point and append new messages
      const commonAncestor = this.findCommonAncestor(target.id, source.id);
      if (commonAncestor !== null) {
        const newMessages = source.messages.slice(commonAncestor);
        target.messages.push(...newMessages);
      } else {
        // No common ancestor, just append all
        target.messages.push(...source.messages);
      }
    } else {
      // Replace: take all messages from source
      target.messages = JSON.parse(JSON.stringify(source.messages));
    }

    target.updatedAt = new Date();
    this.saveBranch(target);

    this.emit("branch:merged", { source: sourceBranchId, target: target.id, strategy });

    return true;
  }

  private findCommonAncestor(branchId1: string, branchId2: string): number | null {
    const branch1 = this.branches.get(branchId1);
    const branch2 = this.branches.get(branchId2);

    if (!branch1 || !branch2) return null;

    // If they share a parent, return the fork point
    if (branch1.parentId === branch2.id) {
      return branch1.parentMessageIndex ?? 0;
    }
    if (branch2.parentId === branch1.id) {
      return branch2.parentMessageIndex ?? 0;
    }
    if (branch1.parentId === branch2.parentId && branch1.parentId) {
      return Math.min(
        branch1.parentMessageIndex ?? 0,
        branch2.parentMessageIndex ?? 0
      );
    }

    return null;
  }

  /**
   * Delete a branch
   */
  deleteBranch(branchId: string): boolean {
    if (branchId === "main") {
      return false; // Can't delete main
    }

    if (this.currentBranchId === branchId) {
      this.currentBranchId = "main";
    }

    const deleted = this.branches.delete(branchId);
    if (deleted) {
      this.deleteBranchFile(branchId);
      this.emit("branch:deleted", { id: branchId });
    }

    return deleted;
  }

  /**
   * Rename a branch
   */
  renameBranch(branchId: string, newName: string): boolean {
    const branch = this.branches.get(branchId);
    if (!branch) return false;

    branch.name = newName;
    branch.updatedAt = new Date();
    this.saveBranch(branch);

    this.emit("branch:renamed", { id: branchId, name: newName });

    return true;
  }

  /**
   * Get all branches
   */
  getAllBranches(): ConversationBranch[] {
    return Array.from(this.branches.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Get branch tree
   */
  getBranchTree(): BranchTree[] {
    const roots: BranchTree[] = [];
    const branchMap = new Map<string, BranchTree>();

    // Create tree nodes
    for (const branch of this.branches.values()) {
      branchMap.set(branch.id, { branch, children: [] });
    }

    // Build tree structure
    for (const branch of this.branches.values()) {
      const node = branchMap.get(branch.id)!;
      if (branch.parentId) {
        const parent = branchMap.get(branch.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get branch history (ancestors)
   */
  getBranchHistory(branchId: string): ConversationBranch[] {
    const history: ConversationBranch[] = [];
    let currentId: string | undefined = branchId;

    while (currentId) {
      const branch = this.branches.get(currentId);
      if (!branch) break;

      history.unshift(branch);
      currentId = branch.parentId;
    }

    return history;
  }

  /**
   * Format branches for display
   */
  formatBranches(): string {
    const branches = this.getAllBranches();
    const currentId = this.currentBranchId;

    let output = `\n🌿 Conversation Branches\n${"═".repeat(50)}\n\n`;

    for (const branch of branches) {
      const isCurrent = branch.id === currentId ? " 🟢 (current)" : "";
      const hasParent = branch.parentId ? ` (from ${branch.parentId.slice(0, 8)})` : "";

      output += `  📌 ${branch.name}${isCurrent}\n`;
      output += `     ID: ${branch.id}${hasParent}\n`;
      output += `     Messages: ${branch.messages.length}\n`;
      output += `     Updated: ${branch.updatedAt.toLocaleString()}\n`;
      output += `\n`;
    }

    output += `${"═".repeat(50)}\n`;
    output += `💡 Commands: /fork <name>, /checkout <id>, /merge <id>, /branches\n`;

    return output;
  }

  /**
   * Format branch tree for display
   */
  formatBranchTree(): string {
    const trees = this.getBranchTree();

    let output = `\n🌳 Branch Tree\n${"═".repeat(50)}\n\n`;

    const formatNode = (node: BranchTree, indent: string = ""): string => {
      const isCurrent = node.branch.id === this.currentBranchId ? " 🟢" : "";
      let result = `${indent}├─ ${node.branch.name} (${node.branch.messages.length} msgs)${isCurrent}\n`;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLast = i === node.children.length - 1;
        const newIndent = indent + (isLast ? "   " : "│  ");
        result += formatNode(child, newIndent);
      }

      return result;
    };

    for (const tree of trees) {
      output += formatNode(tree);
    }

    output += `\n${"═".repeat(50)}\n`;

    return output;
  }
}

// Singleton instance
let branchManagerInstance: ConversationBranchManager | null = null;

export function getBranchManager(sessionId?: string): ConversationBranchManager {
  if (!branchManagerInstance) {
    branchManagerInstance = new ConversationBranchManager(sessionId);
  }
  return branchManagerInstance;
}

export function resetBranchManager(): void {
  branchManagerInstance = null;
}
