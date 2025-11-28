/**
 * Multimodal Tools Index
 * Exports all multimodal tools for easy import
 */

// PDF Tool - Read and extract content from PDF files
export { PDFTool } from './pdf-tool.js';
export type { PDFContent, PDFMetadata, PDFPage } from './pdf-tool.js';

// Audio Tool - Audio file analysis and transcription
export { AudioTool } from './audio-tool.js';
export type { AudioInfo, TranscriptionResult, TranscriptionSegment } from './audio-tool.js';

// Video Tool - Video processing and frame extraction
export { VideoTool } from './video-tool.js';
export type { VideoInfo, FrameExtraction, ExtractedFrame } from './video-tool.js';

// Screenshot Tool - Screen capture functionality
export { ScreenshotTool } from './screenshot-tool.js';
export type { ScreenshotOptions, ScreenshotResult } from './screenshot-tool.js';

// Clipboard Tool - System clipboard integration
export { ClipboardTool } from './clipboard-tool.js';
export type { ClipboardContent } from './clipboard-tool.js';

// Document Tool - Office document support (DOCX, XLSX, PPTX)
export { DocumentTool } from './document-tool.js';
export type { DocumentContent, DocumentMetadata, SheetContent, SlideContent } from './document-tool.js';

// OCR Tool - Optical character recognition
export { OCRTool } from './ocr-tool.js';
export type { OCRResult, OCRBlock, OCROptions } from './ocr-tool.js';

// Diagram Tool - Diagram generation (Mermaid, ASCII)
export { DiagramTool } from './diagram-tool.js';
export type { DiagramType, DiagramOptions, DiagramResult } from './diagram-tool.js';

// Export Tool - Conversation and data export
export { ExportTool } from './export-tool.js';
export type { ExportFormat, Message, ConversationExport, ExportOptions } from './export-tool.js';

// QR Tool - QR code generation and reading
export { QRTool } from './qr-tool.js';
export type { QRGenerateOptions, QRDecodeResult } from './qr-tool.js';

// Archive Tool - Archive handling (ZIP, TAR, etc.)
export { ArchiveTool } from './archive-tool.js';
export type { ArchiveInfo, ArchiveEntry, ExtractOptions, CreateOptions } from './archive-tool.js';

/**
 * Create instances of all multimodal tools
 */
export function createMultimodalTools() {
  return {
    pdf: new (require('./pdf-tool.js').PDFTool)(),
    audio: new (require('./audio-tool.js').AudioTool)(),
    video: new (require('./video-tool.js').VideoTool)(),
    screenshot: new (require('./screenshot-tool.js').ScreenshotTool)(),
    clipboard: new (require('./clipboard-tool.js').ClipboardTool)(),
    document: new (require('./document-tool.js').DocumentTool)(),
    ocr: new (require('./ocr-tool.js').OCRTool)(),
    diagram: new (require('./diagram-tool.js').DiagramTool)(),
    export: new (require('./export-tool.js').ExportTool)(),
    qr: new (require('./qr-tool.js').QRTool)(),
    archive: new (require('./archive-tool.js').ArchiveTool)(),
  };
}

/**
 * Multimodal tool descriptions for help display
 */
export const MULTIMODAL_TOOL_DESCRIPTIONS = {
  pdf: {
    name: 'PDF Tool',
    description: 'Read and extract content from PDF files',
    operations: ['extractText', 'getInfo', 'listPDFs', 'toBase64']
  },
  audio: {
    name: 'Audio Tool',
    description: 'Analyze and transcribe audio files',
    operations: ['getInfo', 'transcribe', 'toBase64', 'listAudioFiles']
  },
  video: {
    name: 'Video Tool',
    description: 'Process video files and extract frames',
    operations: ['getInfo', 'extractFrames', 'createThumbnail', 'extractAudio', 'listVideos']
  },
  screenshot: {
    name: 'Screenshot Tool',
    description: 'Capture screenshots',
    operations: ['capture', 'captureWindow', 'captureRegion', 'captureDelayed', 'listScreenshots']
  },
  clipboard: {
    name: 'Clipboard Tool',
    description: 'Read and write to system clipboard',
    operations: ['readText', 'writeText', 'readImage', 'writeImage', 'clear']
  },
  document: {
    name: 'Document Tool',
    description: 'Read Office documents (DOCX, XLSX, PPTX, CSV)',
    operations: ['readDocument', 'listDocuments']
  },
  ocr: {
    name: 'OCR Tool',
    description: 'Extract text from images using OCR',
    operations: ['extractText', 'listLanguages', 'batchOCR', 'extractRegion']
  },
  diagram: {
    name: 'Diagram Tool',
    description: 'Generate flowcharts, sequence diagrams, and more',
    operations: ['generateFromMermaid', 'generateFlowchart', 'generateSequenceDiagram', 'generateClassDiagram', 'generatePieChart', 'generateGanttChart']
  },
  export: {
    name: 'Export Tool',
    description: 'Export conversations to various formats',
    operations: ['exportConversation', 'exportToCSV', 'exportCodeSnippets', 'listExports']
  },
  qr: {
    name: 'QR Tool',
    description: 'Generate and read QR codes',
    operations: ['generate', 'decode', 'generateWiFi', 'generateVCard', 'generateURL']
  },
  archive: {
    name: 'Archive Tool',
    description: 'Work with compressed archives (ZIP, TAR, etc.)',
    operations: ['list', 'extract', 'create', 'listArchives']
  }
};
