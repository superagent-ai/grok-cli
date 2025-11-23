import * as fs from "fs-extra";
import * as path from "path";
import { writeFile as writeFilePromise } from "fs/promises";
import { ToolResult } from "../types/index.js";
import { ConfirmationService } from "../utils/confirmation-service.js";
import { getCheckpointManager } from "../checkpoints/checkpoint-manager.js";

export interface EditOperation {
  file_path: string;
  old_str: string;
  new_str: string;
  replace_all?: boolean;
}

export interface MultiEditResult {
  success: boolean;
  results: Array<{
    file_path: string;
    success: boolean;
    output?: string;
    error?: string;
  }>;
  summary: string;
}

export class MultiEditTool {
  private confirmationService = ConfirmationService.getInstance();
  private checkpointManager = getCheckpointManager();

  async execute(edits: EditOperation[]): Promise<ToolResult> {
    if (!edits || edits.length === 0) {
      return {
        success: false,
        error: "No edits provided",
      };
    }

    // Validate all files exist before making any changes
    const validationErrors: string[] = [];
    for (const edit of edits) {
      const resolvedPath = path.resolve(edit.file_path);
      if (!(await fs.pathExists(resolvedPath))) {
        validationErrors.push(`File not found: ${edit.file_path}`);
      }
    }

    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed:\n${validationErrors.join("\n")}`,
      };
    }

    // Check for user confirmation if needed
    const sessionFlags = this.confirmationService.getSessionFlags();
    if (!sessionFlags.fileOperations && !sessionFlags.allOperations) {
      const editSummary = edits
        .map((e) => `  - ${e.file_path}: "${e.old_str.slice(0, 30)}..." → "${e.new_str.slice(0, 30)}..."`)
        .join("\n");

      const confirmationResult = await this.confirmationService.requestConfirmation(
        {
          operation: `Multi-edit (${edits.length} files)`,
          filename: edits.map(e => e.file_path).join(", "),
          showVSCodeOpen: false,
          content: `The following edits will be made:\n${editSummary}`,
        },
        "file"
      );

      if (!confirmationResult.confirmed) {
        return {
          success: false,
          error: confirmationResult.feedback || "Multi-edit cancelled by user",
        };
      }
    }

    // Create checkpoint before making any changes
    const checkpointId = `multi-edit-${Date.now()}`;
    for (const edit of edits) {
      this.checkpointManager.checkpointBeforeEdit(edit.file_path);
    }

    // Execute all edits
    const results: MultiEditResult["results"] = [];
    let successCount = 0;
    let failCount = 0;

    for (const edit of edits) {
      try {
        const result = await this.executeEdit(edit);
        results.push({
          file_path: edit.file_path,
          ...result,
        });
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error: any) {
        results.push({
          file_path: edit.file_path,
          success: false,
          error: error.message,
        });
        failCount++;
      }
    }

    // Generate summary
    const summary = this.generateSummary(results);

    return {
      success: failCount === 0,
      output: summary,
      error: failCount > 0 ? `${failCount} edit(s) failed` : undefined,
    };
  }

  private async executeEdit(edit: EditOperation): Promise<{ success: boolean; output?: string; error?: string }> {
    const resolvedPath = path.resolve(edit.file_path);
    const content = await fs.readFile(resolvedPath, "utf-8");

    if (!content.includes(edit.old_str)) {
      return {
        success: false,
        error: `String not found in file: "${edit.old_str.slice(0, 50)}..."`,
      };
    }

    const newContent = edit.replace_all
      ? content.split(edit.old_str).join(edit.new_str)
      : content.replace(edit.old_str, edit.new_str);

    await writeFilePromise(resolvedPath, newContent, "utf-8");

    // Calculate diff stats
    const oldLines = content.split("\n").length;
    const newLines = newContent.split("\n").length;
    const lineDiff = newLines - oldLines;

    return {
      success: true,
      output: `Updated ${edit.file_path} (${lineDiff >= 0 ? "+" : ""}${lineDiff} lines)`,
    };
  }

  private generateSummary(results: MultiEditResult["results"]): string {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    let summary = `Multi-Edit Results:\n`;
    summary += `  ✓ ${successful.length} successful\n`;
    summary += `  ✗ ${failed.length} failed\n\n`;

    if (successful.length > 0) {
      summary += "Successful edits:\n";
      for (const result of successful) {
        summary += `  ✓ ${result.file_path}\n`;
      }
    }

    if (failed.length > 0) {
      summary += "\nFailed edits:\n";
      for (const result of failed) {
        summary += `  ✗ ${result.file_path}: ${result.error}\n`;
      }
    }

    return summary;
  }

  async executeParallel(edits: EditOperation[]): Promise<ToolResult> {
    if (!edits || edits.length === 0) {
      return {
        success: false,
        error: "No edits provided",
      };
    }

    // Group edits by file to avoid conflicts
    const editsByFile = new Map<string, EditOperation[]>();
    for (const edit of edits) {
      const existing = editsByFile.get(edit.file_path) || [];
      existing.push(edit);
      editsByFile.set(edit.file_path, existing);
    }

    // Execute edits for different files in parallel
    const filePromises = Array.from(editsByFile.entries()).map(
      async ([filePath, fileEdits]) => {
        const results: Array<{ success: boolean; output?: string; error?: string }> = [];

        // Edits to the same file must be sequential
        for (const edit of fileEdits) {
          const result = await this.executeEdit(edit);
          results.push(result);
          if (!result.success) break;  // Stop on first error for this file
        }

        return { filePath, results };
      }
    );

    const fileResults = await Promise.all(filePromises);

    // Combine results
    const allResults: MultiEditResult["results"] = [];
    for (const { filePath, results } of fileResults) {
      for (const result of results) {
        allResults.push({
          file_path: filePath,
          ...result,
        });
      }
    }

    const summary = this.generateSummary(allResults);
    const failCount = allResults.filter((r) => !r.success).length;

    return {
      success: failCount === 0,
      output: summary,
      error: failCount > 0 ? `${failCount} edit(s) failed` : undefined,
    };
  }
}

// Singleton instance
let multiEditToolInstance: MultiEditTool | null = null;

export function getMultiEditTool(): MultiEditTool {
  if (!multiEditToolInstance) {
    multiEditToolInstance = new MultiEditTool();
  }
  return multiEditToolInstance;
}
