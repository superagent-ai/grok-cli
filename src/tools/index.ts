// Core tools
export { BashTool } from "./bash.js";
export { TextEditorTool } from "./text-editor.js";
export { MorphEditorTool } from "./morph-editor.js";
export { TodoTool } from "./todo-tool.js";
export { ConfirmationTool } from "./confirmation-tool.js";
export { SearchTool } from "./search.js";
export { WebSearchTool } from "./web-search.js";
export { ImageTool } from "./image-tool.js";

// New advanced tools
export { MultiEditTool, getMultiEditTool } from "./multi-edit.js";
export { GitTool, getGitTool } from "./git-tool.js";
export { InteractiveBashTool, getInteractiveBash } from "./interactive-bash.js";

// Enhanced competitor features
export { CommentWatcher, getCommentWatcher, resetCommentWatcher } from "./comment-watcher.js";
export { TestGeneratorTool, testGeneratorToolDefinition } from "./test-generator.js";
