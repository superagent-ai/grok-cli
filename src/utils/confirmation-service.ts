import { exec } from "child_process";
import { promisify } from "util";
import { EventEmitter } from "events";

const execAsync = promisify(exec);

export interface ConfirmationOptions {
  operation: string;
  filename: string;
  showVSCodeOpen?: boolean;
  content?: string; // Content to show in confirmation dialog
}

export interface ConfirmationResult {
  confirmed: boolean;
  dontAskAgain?: boolean;
  feedback?: string;
}

export class ConfirmationService extends EventEmitter {
  private static instance: ConfirmationService;
  private skipConfirmationThisSession = false;
  private pendingConfirmation: Promise<ConfirmationResult> | null = null;
  private resolveConfirmation: ((result: ConfirmationResult) => void) | null =
    null;

  // Session flags for different operation types
  private sessionFlags = {
    fileOperations: false,
    bashCommands: false,
    allOperations: false,
  };

  static getInstance(): ConfirmationService {
    if (!ConfirmationService.instance) {
      ConfirmationService.instance = new ConfirmationService();
    }
    return ConfirmationService.instance;
  }

  constructor() {
    super();
  }

  async requestConfirmation(
    options: ConfirmationOptions,
    operationType: "file" | "bash" = "file"
  ): Promise<ConfirmationResult> {
    // Check session flags
    if (
      this.sessionFlags.allOperations ||
      (operationType === "file" && this.sessionFlags.fileOperations) ||
      (operationType === "bash" && this.sessionFlags.bashCommands)
    ) {
      return { confirmed: true };
    }

    // If VS Code should be opened, try to open it
    if (options.showVSCodeOpen) {
      try {
        await this.openInVSCode(options.filename);
      } catch (error) {
        // If VS Code opening fails, continue without it
        options.showVSCodeOpen = false;
      }
    }

    // Create a promise that will be resolved by the UI component
    this.pendingConfirmation = new Promise<ConfirmationResult>((resolve) => {
      this.resolveConfirmation = resolve;
    });

    // Emit custom event that the UI can listen to (using setImmediate to ensure the UI updates)
    setImmediate(() => {
      this.emit("confirmation-requested", options);
    });

    const result = await this.pendingConfirmation;

    if (result.dontAskAgain) {
      // Set the appropriate session flag based on operation type
      if (operationType === "file") {
        this.sessionFlags.fileOperations = true;
      } else if (operationType === "bash") {
        this.sessionFlags.bashCommands = true;
      }
      // Could also set allOperations for global skip
    }

    return result;
  }

  confirmOperation(confirmed: boolean, dontAskAgain?: boolean): void {
    if (this.resolveConfirmation) {
      this.resolveConfirmation({ confirmed, dontAskAgain });
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  rejectOperation(feedback?: string): void {
    if (this.resolveConfirmation) {
      this.resolveConfirmation({ confirmed: false, feedback });
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  private async openInVSCode(filename: string): Promise<void> {
    // Try different VS Code commands
    const commands = ["code", "code-insiders", "codium"];

    for (const cmd of commands) {
      try {
        await execAsync(`which ${cmd}`);
        await execAsync(`${cmd} "${filename}"`);
        return;
      } catch (error) {
        // Continue to next command
        continue;
      }
    }

    throw new Error("VS Code not found");
  }

  isPending(): boolean {
    return this.pendingConfirmation !== null;
  }

  resetSession(): void {
    this.sessionFlags = {
      fileOperations: false,
      bashCommands: false,
      allOperations: false,
    };
  }

  getSessionFlags() {
    return { ...this.sessionFlags };
  }

  setSessionFlag(
    flagType: "fileOperations" | "bashCommands" | "allOperations",
    value: boolean
  ) {
    this.sessionFlags[flagType] = value;
  }
}
