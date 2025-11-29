import { GrokTool } from "./client.js";
import { MCPManager, MCPTool } from "../mcp/client.js";
import { loadMCPConfig } from "../mcp/config.js";
import {
  getToolSelector,
  selectRelevantTools,
  ToolSelectionResult,
  QueryClassification,
  ToolCategory
} from "../tools/tool-selector.js";

// Multi-edit tool for atomic multi-file changes
const MULTI_EDIT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "multi_edit",
    description: "Edit multiple files simultaneously in a single atomic operation. Use this for refactoring across multiple files.",
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          description: "Array of edit operations to perform",
          items: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description: "Path to the file to edit"
              },
              old_str: {
                type: "string",
                description: "Text to replace"
              },
              new_str: {
                type: "string",
                description: "Text to replace with"
              },
              replace_all: {
                type: "boolean",
                description: "Replace all occurrences (default: false)"
              }
            },
            required: ["file_path", "old_str", "new_str"]
          }
        }
      },
      required: ["edits"]
    }
  }
};

// Git tool for version control operations
const GIT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "git",
    description: "Perform git operations: status, diff, add, commit, push, pull, branch, checkout, stash",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["status", "diff", "add", "commit", "push", "pull", "branch", "checkout", "stash", "auto_commit"],
          description: "The git operation to perform"
        },
        args: {
          type: "object",
          description: "Operation-specific arguments",
          properties: {
            files: {
              type: "array",
              items: { type: "string" },
              description: "Files to add/commit (for add operation)"
            },
            message: {
              type: "string",
              description: "Commit message (for commit operation)"
            },
            branch: {
              type: "string",
              description: "Branch name (for branch/checkout operations)"
            },
            staged: {
              type: "boolean",
              description: "Show staged diff only (for diff operation)"
            },
            push: {
              type: "boolean",
              description: "Push after commit (for auto_commit)"
            }
          }
        }
      },
      required: ["operation"]
    }
  }
};

// Codebase map tool for understanding project structure
const CODEBASE_MAP_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "codebase_map",
    description: "Build and query a map of the codebase structure, symbols, and dependencies",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["build", "summary", "search", "symbols"],
          description: "The operation: build (create map), summary (show overview), search (find relevant files), symbols (list exported symbols)"
        },
        query: {
          type: "string",
          description: "Search query for finding relevant context"
        },
        deep: {
          type: "boolean",
          description: "Perform deep analysis including symbols and dependencies (slower)"
        }
      },
      required: ["operation"]
    }
  }
};

// Subagent tool for spawning specialized agents
const SUBAGENT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "spawn_subagent",
    description: "Spawn a specialized subagent for specific tasks: code-reviewer, debugger, test-runner, explorer, refactorer, documenter",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["code-reviewer", "debugger", "test-runner", "explorer", "refactorer", "documenter"],
          description: "Type of subagent to spawn"
        },
        task: {
          type: "string",
          description: "The task for the subagent to perform"
        },
        context: {
          type: "string",
          description: "Additional context for the task"
        }
      },
      required: ["type", "task"]
    }
  }
};

// ============== MULTIMODAL TOOLS ==============

// PDF Tool - Read and extract content from PDF files
const PDF_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "pdf",
    description: "Read and extract content from PDF files. Supports text extraction, metadata reading, and page-specific extraction.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["extract", "info", "list", "to_base64"],
          description: "Operation: extract (get text content), info (get metadata), list (list PDFs in directory), to_base64 (convert to base64)"
        },
        path: {
          type: "string",
          description: "Path to PDF file or directory"
        },
        pages: {
          type: "array",
          items: { type: "number" },
          description: "Specific page numbers to extract (optional)"
        },
        max_pages: {
          type: "number",
          description: "Maximum number of pages to extract (optional)"
        }
      },
      required: ["operation", "path"]
    }
  }
};

// Audio Tool - Process and transcribe audio files
const AUDIO_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "audio",
    description: "Process and transcribe audio files. Supports info extraction, transcription (via Whisper API), and format conversion.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["info", "transcribe", "list", "to_base64"],
          description: "Operation: info (get audio metadata), transcribe (convert speech to text), list (list audio files), to_base64"
        },
        path: {
          type: "string",
          description: "Path to audio file or directory"
        },
        language: {
          type: "string",
          description: "Language code for transcription (e.g., 'en', 'fr', 'es')"
        },
        prompt: {
          type: "string",
          description: "Optional prompt to guide transcription"
        }
      },
      required: ["operation", "path"]
    }
  }
};

// Video Tool - Process video files and extract frames
const VIDEO_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "video",
    description: "Process video files: get info, extract frames, create thumbnails, extract audio. Requires ffmpeg for most operations.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["info", "extract_frames", "thumbnail", "extract_audio", "list"],
          description: "Operation to perform on the video"
        },
        path: {
          type: "string",
          description: "Path to video file or directory"
        },
        interval: {
          type: "number",
          description: "Seconds between frames for frame extraction"
        },
        count: {
          type: "number",
          description: "Number of frames to extract"
        },
        timestamps: {
          type: "array",
          items: { type: "number" },
          description: "Specific timestamps (in seconds) to extract frames from"
        },
        output_dir: {
          type: "string",
          description: "Output directory for extracted content"
        }
      },
      required: ["operation", "path"]
    }
  }
};

// Screenshot Tool - Capture screenshots
const SCREENSHOT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "screenshot",
    description: "Capture screenshots: fullscreen, window, or region. Works on Linux, macOS, and Windows.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["capture", "capture_window", "capture_region", "capture_delayed", "list", "to_base64", "delete", "clear"],
          description: "Screenshot operation to perform"
        },
        delay: {
          type: "number",
          description: "Delay in seconds before capture"
        },
        region: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" }
          },
          description: "Region to capture (for capture_region)"
        },
        window: {
          type: "string",
          description: "Window title or ID to capture"
        },
        format: {
          type: "string",
          enum: ["png", "jpg"],
          description: "Output format (default: png)"
        },
        path: {
          type: "string",
          description: "Path for to_base64 or delete operations"
        }
      },
      required: ["operation"]
    }
  }
};

// Clipboard Tool - System clipboard operations
const CLIPBOARD_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "clipboard",
    description: "Read and write to system clipboard. Supports text, images, and HTML content.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["read_text", "write_text", "read_image", "write_image", "read_html", "copy_file_path", "copy_file_content", "get_type", "clear"],
          description: "Clipboard operation to perform"
        },
        text: {
          type: "string",
          description: "Text to write to clipboard (for write_text)"
        },
        path: {
          type: "string",
          description: "File path (for image operations or copy_file_*)"
        }
      },
      required: ["operation"]
    }
  }
};

// Document Tool - Read Office documents
const DOCUMENT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "document",
    description: "Read Office documents (DOCX, XLSX, PPTX, CSV, RTF). Extracts text, metadata, and structure.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["read", "list"],
          description: "Operation: read (extract content), list (list documents in directory)"
        },
        path: {
          type: "string",
          description: "Path to document or directory"
        }
      },
      required: ["operation", "path"]
    }
  }
};

// OCR Tool - Extract text from images
const OCR_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "ocr",
    description: "Extract text from images using OCR. Uses Tesseract if available, or vision API as fallback.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["extract", "extract_region", "list_languages", "batch"],
          description: "OCR operation to perform"
        },
        path: {
          type: "string",
          description: "Path to image file"
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Array of image paths for batch OCR"
        },
        language: {
          type: "string",
          description: "OCR language code (e.g., 'eng', 'fra', 'deu')"
        },
        region: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" }
          },
          description: "Region to OCR (for extract_region)"
        }
      },
      required: ["operation"]
    }
  }
};

// Diagram Tool - Generate diagrams
const DIAGRAM_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "diagram",
    description: "Generate diagrams: flowcharts, sequence diagrams, class diagrams, pie charts, Gantt charts, and ASCII art.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["mermaid", "flowchart", "sequence", "class", "pie", "gantt", "ascii_box", "ascii_tree", "list"],
          description: "Type of diagram to generate"
        },
        code: {
          type: "string",
          description: "Mermaid code for mermaid operation"
        },
        title: {
          type: "string",
          description: "Title for the diagram"
        },
        nodes: {
          type: "array",
          description: "Nodes for flowchart or ASCII tree"
        },
        connections: {
          type: "array",
          description: "Connections between nodes"
        },
        participants: {
          type: "array",
          items: { type: "string" },
          description: "Participants for sequence diagram"
        },
        messages: {
          type: "array",
          description: "Messages for sequence diagram"
        },
        classes: {
          type: "array",
          description: "Classes for class diagram"
        },
        relationships: {
          type: "array",
          description: "Relationships for class diagram"
        },
        data: {
          type: "array",
          description: "Data points for pie chart"
        },
        sections: {
          type: "array",
          description: "Sections for Gantt chart"
        },
        format: {
          type: "string",
          enum: ["svg", "png", "ascii", "utf8"],
          description: "Output format (default: ascii)"
        }
      },
      required: ["operation"]
    }
  }
};

// Export Tool - Export conversations and data
const EXPORT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "export",
    description: "Export conversations to various formats: JSON, Markdown, HTML, plain text, or PDF.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["conversation", "csv", "code_snippets", "list"],
          description: "Export operation"
        },
        format: {
          type: "string",
          enum: ["json", "markdown", "html", "txt", "pdf"],
          description: "Export format for conversation"
        },
        messages: {
          type: "array",
          description: "Messages to export"
        },
        data: {
          type: "array",
          description: "Data array for CSV export"
        },
        title: {
          type: "string",
          description: "Title for the export"
        },
        include_metadata: {
          type: "boolean",
          description: "Include metadata in export"
        },
        include_timestamps: {
          type: "boolean",
          description: "Include timestamps in export"
        },
        theme: {
          type: "string",
          enum: ["light", "dark"],
          description: "Theme for HTML export"
        },
        output_path: {
          type: "string",
          description: "Output file path"
        }
      },
      required: ["operation"]
    }
  }
};

// QR Tool - Generate and read QR codes
const QR_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "qr",
    description: "Generate and read QR codes. Supports URL, WiFi, vCard, and custom data. Can output ASCII, SVG, or PNG.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["generate", "generate_url", "generate_wifi", "generate_vcard", "decode", "list"],
          description: "QR code operation"
        },
        data: {
          type: "string",
          description: "Data to encode in QR code"
        },
        url: {
          type: "string",
          description: "URL for generate_url"
        },
        ssid: {
          type: "string",
          description: "WiFi SSID for generate_wifi"
        },
        password: {
          type: "string",
          description: "WiFi password for generate_wifi"
        },
        wifi_type: {
          type: "string",
          enum: ["WPA", "WEP", "nopass"],
          description: "WiFi security type"
        },
        contact: {
          type: "object",
          description: "Contact info for vCard (firstName, lastName, phone, email, etc.)"
        },
        path: {
          type: "string",
          description: "Path to QR code image for decode"
        },
        format: {
          type: "string",
          enum: ["ascii", "utf8", "svg", "png"],
          description: "Output format (default: utf8)"
        }
      },
      required: ["operation"]
    }
  }
};

// Archive Tool - Work with compressed archives
const ARCHIVE_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "archive",
    description: "Work with compressed archives: ZIP, TAR, TAR.GZ, 7Z, RAR. List, extract, and create archives.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["list", "extract", "create", "list_archives"],
          description: "Archive operation to perform"
        },
        path: {
          type: "string",
          description: "Path to archive file or directory"
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Source paths for creating archive"
        },
        output_dir: {
          type: "string",
          description: "Output directory for extraction"
        },
        output_path: {
          type: "string",
          description: "Output path for created archive"
        },
        format: {
          type: "string",
          enum: ["zip", "tar", "tar.gz", "tar.bz2", "tar.xz"],
          description: "Format for creating archive (default: zip)"
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Specific files to extract"
        },
        password: {
          type: "string",
          description: "Password for encrypted archives"
        },
        overwrite: {
          type: "boolean",
          description: "Overwrite existing files during extraction"
        }
      },
      required: ["operation"]
    }
  }
};

const BASE_GROK_TOOLS: GrokTool[] = [
  {
    type: "function",
    function: {
      name: "view_file",
      description: "View contents of a file or list directory contents",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to file or directory to view",
          },
          start_line: {
            type: "number",
            description:
              "Starting line number for partial file view (optional)",
          },
          end_line: {
            type: "number",
            description: "Ending line number for partial file view (optional)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file with specified content",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path where the file should be created",
          },
          content: {
            type: "string",
            description: "Content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "str_replace_editor",
      description: "Replace specific text in a file. Use this for single line edits only",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to edit",
          },
          old_str: {
            type: "string",
            description:
              "Text to replace (must match exactly, or will use fuzzy matching for multi-line strings)",
          },
          new_str: {
            type: "string",
            description: "Text to replace with",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace all occurrences (default: false, only replaces first occurrence)",
          },
        },
        required: ["path", "old_str", "new_str"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a bash command",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description:
        "Unified search tool for finding text content or files (similar to Cursor's search)",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for or file name/path pattern",
          },
          search_type: {
            type: "string",
            enum: ["text", "files", "both"],
            description:
              "Type of search: 'text' for content search, 'files' for file names, 'both' for both (default: 'both')",
          },
          include_pattern: {
            type: "string",
            description:
              "Glob pattern for files to include (e.g. '*.ts', '*.js')",
          },
          exclude_pattern: {
            type: "string",
            description:
              "Glob pattern for files to exclude (e.g. '*.log', 'node_modules')",
          },
          case_sensitive: {
            type: "boolean",
            description:
              "Whether search should be case sensitive (default: false)",
          },
          whole_word: {
            type: "boolean",
            description: "Whether to match whole words only (default: false)",
          },
          regex: {
            type: "boolean",
            description: "Whether query is a regex pattern (default: false)",
          },
          max_results: {
            type: "number",
            description: "Maximum number of results to return (default: 50)",
          },
          file_types: {
            type: "array",
            items: { type: "string" },
            description: "File types to search (e.g. ['js', 'ts', 'py'])",
          },
          include_hidden: {
            type: "boolean",
            description: "Whether to include hidden files (default: false)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_todo_list",
      description: "Create a new todo list for planning and tracking tasks",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "Array of todo items",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Unique identifier for the todo item",
                },
                content: {
                  type: "string",
                  description: "Description of the todo item",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "Current status of the todo item",
                },
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "Priority level of the todo item",
                },
              },
              required: ["id", "content", "status", "priority"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_todo_list",
      description: "Update existing todos in the todo list",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            description: "Array of todo updates",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the todo item to update",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "New status for the todo item",
                },
                content: {
                  type: "string",
                  description: "New content for the todo item",
                },
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "New priority for the todo item",
                },
              },
              required: ["id"],
            },
          },
        },
        required: ["updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information, documentation, or answers to questions",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to execute",
          },
          max_results: {
            type: "number",
            description: "Maximum number of results to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch and read the content of a web page URL",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the web page to fetch",
          },
        },
        required: ["url"],
      },
    },
  },
];

// Morph Fast Apply tool (conditional)
const MORPH_EDIT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "edit_file",
    description: "Use this tool to make an edit to an existing file.\n\nThis will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.\nWhen writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.\n\nFor example:\n\n// ... existing code ...\nFIRST_EDIT\n// ... existing code ...\nSECOND_EDIT\n// ... existing code ...\nTHIRD_EDIT\n// ... existing code ...\n\nYou should still bias towards repeating as few lines of the original file as possible to convey the change.\nBut, each edit should contain sufficient context of unchanged lines around the code you're editing to resolve ambiguity.\nDO NOT omit spans of pre-existing code (or comments) without using the // ... existing code ... comment to indicate its absence. If you omit the existing code comment, the model may inadvertently delete these lines.\nIf you plan on deleting a section, you must provide context before and after to delete it. If the initial code is ```code \\n Block 1 \\n Block 2 \\n Block 3 \\n code```, and you want to remove Block 2, you would output ```// ... existing code ... \\n Block 1 \\n  Block 3 \\n // ... existing code ...```.\nMake sure it is clear what the edit should be, and where it should be applied.\nMake edits to a file in a single edit_file call instead of multiple edit_file calls to the same file. The apply model can handle many distinct edits at once.",
    parameters: {
      type: "object",
      properties: {
        target_file: {
          type: "string",
          description: "The target file to modify."
        },
        instructions: {
          type: "string",
          description: "A single sentence instruction describing what you are going to do for the sketched edit. This is used to assist the less intelligent model in applying the edit. Use the first person to describe what you are going to do. Use it to disambiguate uncertainty in the edit."
        },
        code_edit: {
          type: "string",
          description: "Specify ONLY the precise lines of code that you wish to edit. NEVER specify or write out unchanged code. Instead, represent all unchanged code using the comment of the language you're editing in - example: // ... existing code ..."
        }
      },
      required: ["target_file", "instructions", "code_edit"]
    }
  }
};

// Function to build tools array conditionally
function buildGrokTools(): GrokTool[] {
  const tools = [...BASE_GROK_TOOLS];

  // Add Morph Fast Apply tool if API key is available
  if (process.env.MORPH_API_KEY) {
    tools.splice(3, 0, MORPH_EDIT_TOOL); // Insert after str_replace_editor
  }

  // Add advanced tools
  tools.push(MULTI_EDIT_TOOL);
  tools.push(GIT_TOOL);
  tools.push(CODEBASE_MAP_TOOL);
  tools.push(SUBAGENT_TOOL);

  // Add multimodal tools
  tools.push(PDF_TOOL);
  tools.push(AUDIO_TOOL);
  tools.push(VIDEO_TOOL);
  tools.push(SCREENSHOT_TOOL);
  tools.push(CLIPBOARD_TOOL);
  tools.push(DOCUMENT_TOOL);
  tools.push(OCR_TOOL);
  tools.push(DIAGRAM_TOOL);
  tools.push(EXPORT_TOOL);
  tools.push(QR_TOOL);
  tools.push(ARCHIVE_TOOL);

  return tools;
}

// Export dynamic tools array
export const GROK_TOOLS: GrokTool[] = buildGrokTools();

// Global MCP manager instance
let mcpManager: MCPManager | null = null;

export function getMCPManager(): MCPManager {
  if (!mcpManager) {
    mcpManager = new MCPManager();
  }
  return mcpManager;
}

export async function initializeMCPServers(): Promise<void> {
  const manager = getMCPManager();
  const config = loadMCPConfig();
  
  // Store original stderr.write
  const originalStderrWrite = process.stderr.write;
  
  // Temporarily suppress stderr to hide verbose MCP connection logs
  process.stderr.write = function(chunk: any, encoding?: any, callback?: any): boolean {
    // Filter out mcp-remote verbose logs
    const chunkStr = chunk.toString();
    if (chunkStr.includes('[') && (
        chunkStr.includes('Using existing client port') ||
        chunkStr.includes('Connecting to remote server') ||
        chunkStr.includes('Using transport strategy') ||
        chunkStr.includes('Connected to remote server') ||
        chunkStr.includes('Local STDIO server running') ||
        chunkStr.includes('Proxy established successfully') ||
        chunkStr.includes('Local→Remote') ||
        chunkStr.includes('Remote→Local')
      )) {
      // Suppress these verbose logs
      if (callback) callback();
      return true;
    }
    
    // Allow other stderr output
    return originalStderrWrite.call(this, chunk, encoding, callback);
  };
  
  try {
    for (const serverConfig of config.servers) {
      try {
        await manager.addServer(serverConfig);
      } catch (error) {
        console.warn(`Failed to initialize MCP server ${serverConfig.name}:`, error);
      }
    }
  } finally {
    // Restore original stderr.write
    process.stderr.write = originalStderrWrite;
  }
}

export function convertMCPToolToGrokTool(mcpTool: MCPTool): GrokTool {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema || {
        type: "object",
        properties: {},
        required: []
      }
    }
  };
}

export function addMCPToolsToGrokTools(baseTools: GrokTool[]): GrokTool[] {
  if (!mcpManager) {
    return baseTools;
  }
  
  const mcpTools = mcpManager.getTools();
  const grokMCPTools = mcpTools.map(convertMCPToolToGrokTool);
  
  return [...baseTools, ...grokMCPTools];
}

export async function getAllGrokTools(): Promise<GrokTool[]> {
  const manager = getMCPManager();
  // Try to initialize servers if not already done, but don't block
  manager.ensureServersInitialized().catch(() => {
    // Ignore initialization errors to avoid blocking
  });

  const allTools = addMCPToolsToGrokTools(GROK_TOOLS);

  // Register MCP tools in the tool selector for better RAG matching
  const selector = getToolSelector();
  for (const tool of allTools) {
    if (tool.function.name.startsWith('mcp__')) {
      selector.registerMCPTool(tool);
    }
  }

  return allTools;
}

/**
 * Get relevant tools for a specific query using RAG-based selection
 *
 * This reduces prompt bloat and improves tool selection accuracy
 * by only including tools that are semantically relevant to the query.
 *
 * @param query - The user's query
 * @param options - Selection options
 * @returns Selected tools and metadata
 */
export async function getRelevantTools(
  query: string,
  options: {
    maxTools?: number;
    minScore?: number;
    includeCategories?: ToolCategory[];
    excludeCategories?: ToolCategory[];
    alwaysInclude?: string[];
    useRAG?: boolean;
  } = {}
): Promise<ToolSelectionResult> {
  const { useRAG = true, maxTools = 15 } = options;

  const allTools = await getAllGrokTools();

  // If RAG is disabled, return all tools
  if (!useRAG) {
    return {
      selectedTools: allTools,
      scores: new Map(allTools.map(t => [t.function.name, 1])),
      classification: {
        categories: ['file_read', 'file_write', 'system'] as ToolCategory[],
        confidence: 1,
        keywords: [],
        requiresMultipleTools: true
      },
      reducedTokens: 0,
      originalTokens: 0
    };
  }

  return selectRelevantTools(query, allTools, maxTools);
}

/**
 * Classify a query to understand what types of tools are needed
 */
export function classifyQuery(query: string): QueryClassification {
  return getToolSelector().classifyQuery(query);
}

/**
 * Get the tool selector instance for advanced usage
 */
export { getToolSelector };

/**
 * Re-export types for convenience
 */
export type { ToolSelectionResult, QueryClassification, ToolCategory };
