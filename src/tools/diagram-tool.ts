import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { ToolResult } from '../types';

export type DiagramType = 'flowchart' | 'sequence' | 'class' | 'state' | 'er' | 'gantt' | 'pie' | 'mindmap' | 'timeline' | 'git' | 'ascii';

export interface DiagramOptions {
  type: DiagramType;
  title?: string;
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
  width?: number;
  height?: number;
  outputFormat?: 'svg' | 'png' | 'ascii';
  outputPath?: string;
}

export interface DiagramResult {
  content: string;
  format: string;
  path?: string;
  mermaidCode?: string;
}

/**
 * Diagram Tool for generating flowcharts, sequence diagrams, and other visualizations
 * Supports Mermaid syntax for rich diagrams and ASCII art for terminal display
 */
export class DiagramTool {
  private readonly outputDir = path.join(process.cwd(), '.grok', 'diagrams');

  /**
   * Generate a diagram from Mermaid code
   */
  async generateFromMermaid(mermaidCode: string, options: Partial<DiagramOptions> = {}): Promise<ToolResult> {
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });

      const outputFormat = options.outputFormat || 'svg';
      const timestamp = Date.now();
      const filename = `diagram_${timestamp}.${outputFormat}`;
      const outputPath = options.outputPath || path.join(this.outputDir, filename);

      if (outputFormat === 'ascii') {
        // Generate ASCII representation
        const asciiDiagram = this.mermaidToAscii(mermaidCode);
        return {
          success: true,
          output: asciiDiagram,
          data: {
            content: asciiDiagram,
            format: 'ascii',
            mermaidCode
          }
        };
      }

      // Check for mermaid-cli
      const hasMermaidCli = await this.checkMermaidCli();

      if (hasMermaidCli) {
        return await this.renderWithMermaidCli(mermaidCode, outputPath, options);
      }

      // Fallback: return Mermaid code for manual rendering
      return {
        success: true,
        output: `Mermaid CLI not installed. Here's the Mermaid code:\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n\nInstall with: npm install -g @mermaid-js/mermaid-cli`,
        data: {
          content: mermaidCode,
          format: 'mermaid',
          mermaidCode
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Diagram generation failed: ${error.message}`
      };
    }
  }

  /**
   * Generate a flowchart
   */
  async generateFlowchart(
    nodes: Array<{ id: string; label: string; type?: 'default' | 'round' | 'diamond' | 'stadium' }>,
    connections: Array<{ from: string; to: string; label?: string; type?: 'arrow' | 'dotted' | 'thick' }>,
    options: Partial<DiagramOptions> = {}
  ): Promise<ToolResult> {
    const direction = 'TD'; // Top-Down
    const lines = [`flowchart ${direction}`];

    // Add nodes
    for (const node of nodes) {
      let shape: string;
      switch (node.type) {
        case 'round':
          shape = `${node.id}(${node.label})`;
          break;
        case 'diamond':
          shape = `${node.id}{${node.label}}`;
          break;
        case 'stadium':
          shape = `${node.id}([${node.label}])`;
          break;
        default:
          shape = `${node.id}[${node.label}]`;
      }
      lines.push(`    ${shape}`);
    }

    // Add connections
    for (const conn of connections) {
      let arrow: string;
      switch (conn.type) {
        case 'dotted':
          arrow = conn.label ? `-. ${conn.label} .->` : '-.->';
          break;
        case 'thick':
          arrow = conn.label ? `== ${conn.label} ==>` : '==>';
          break;
        default:
          arrow = conn.label ? `-- ${conn.label} -->` : '-->';
      }
      lines.push(`    ${conn.from} ${arrow} ${conn.to}`);
    }

    const mermaidCode = lines.join('\n');
    return this.generateFromMermaid(mermaidCode, { ...options, type: 'flowchart' });
  }

  /**
   * Generate a sequence diagram
   */
  async generateSequenceDiagram(
    participants: string[],
    messages: Array<{ from: string; to: string; message: string; type?: 'sync' | 'async' | 'reply' }>,
    options: Partial<DiagramOptions> = {}
  ): Promise<ToolResult> {
    const lines = ['sequenceDiagram'];

    // Add participants
    for (const p of participants) {
      lines.push(`    participant ${p}`);
    }

    // Add messages
    for (const msg of messages) {
      let arrow: string;
      switch (msg.type) {
        case 'async':
          arrow = '-)';
          break;
        case 'reply':
          arrow = '-->';
          break;
        default:
          arrow = '->>';
      }
      lines.push(`    ${msg.from}${arrow}${msg.to}: ${msg.message}`);
    }

    const mermaidCode = lines.join('\n');
    return this.generateFromMermaid(mermaidCode, { ...options, type: 'sequence' });
  }

  /**
   * Generate a class diagram
   */
  async generateClassDiagram(
    classes: Array<{
      name: string;
      attributes?: string[];
      methods?: string[];
    }>,
    relationships: Array<{
      from: string;
      to: string;
      type: 'inheritance' | 'composition' | 'aggregation' | 'association' | 'dependency';
      label?: string;
    }>,
    options: Partial<DiagramOptions> = {}
  ): Promise<ToolResult> {
    const lines = ['classDiagram'];

    // Add classes
    for (const cls of classes) {
      lines.push(`    class ${cls.name} {`);
      if (cls.attributes) {
        for (const attr of cls.attributes) {
          lines.push(`        ${attr}`);
        }
      }
      if (cls.methods) {
        for (const method of cls.methods) {
          lines.push(`        ${method}()`);
        }
      }
      lines.push(`    }`);
    }

    // Add relationships
    for (const rel of relationships) {
      let arrow: string;
      switch (rel.type) {
        case 'inheritance':
          arrow = '<|--';
          break;
        case 'composition':
          arrow = '*--';
          break;
        case 'aggregation':
          arrow = 'o--';
          break;
        case 'dependency':
          arrow = '<..';
          break;
        default:
          arrow = '--';
      }
      const label = rel.label ? ` : ${rel.label}` : '';
      lines.push(`    ${rel.to} ${arrow} ${rel.from}${label}`);
    }

    const mermaidCode = lines.join('\n');
    return this.generateFromMermaid(mermaidCode, { ...options, type: 'class' });
  }

  /**
   * Generate a pie chart
   */
  async generatePieChart(
    title: string,
    data: Array<{ label: string; value: number }>,
    options: Partial<DiagramOptions> = {}
  ): Promise<ToolResult> {
    const lines = [`pie title ${title}`];

    for (const item of data) {
      lines.push(`    "${item.label}" : ${item.value}`);
    }

    const mermaidCode = lines.join('\n');
    return this.generateFromMermaid(mermaidCode, { ...options, type: 'pie' });
  }

  /**
   * Generate a Gantt chart
   */
  async generateGanttChart(
    title: string,
    sections: Array<{
      name: string;
      tasks: Array<{
        name: string;
        id: string;
        start: string; // Date or 'after <id>'
        duration: string; // e.g., '3d', '1w'
        status?: 'done' | 'active' | 'crit';
      }>;
    }>,
    options: Partial<DiagramOptions> = {}
  ): Promise<ToolResult> {
    const lines = [
      'gantt',
      `    title ${title}`,
      '    dateFormat YYYY-MM-DD'
    ];

    for (const section of sections) {
      lines.push(`    section ${section.name}`);
      for (const task of section.tasks) {
        const status = task.status ? `${task.status}, ` : '';
        lines.push(`    ${task.name}: ${status}${task.id}, ${task.start}, ${task.duration}`);
      }
    }

    const mermaidCode = lines.join('\n');
    return this.generateFromMermaid(mermaidCode, { ...options, type: 'gantt' });
  }

  /**
   * Generate ASCII box diagram
   */
  generateAsciiBox(title: string, content: string[], options: { width?: number } = {}): string {
    const width = options.width || Math.max(title.length, ...content.map(c => c.length)) + 4;
    const border = '─'.repeat(width - 2);

    const lines = [
      `┌${border}┐`,
      `│ ${title.padEnd(width - 4)} │`,
      `├${border}┤`
    ];

    for (const line of content) {
      lines.push(`│ ${line.padEnd(width - 4)} │`);
    }

    lines.push(`└${border}┘`);

    return lines.join('\n');
  }

  /**
   * Generate ASCII flowchart
   */
  generateAsciiFlowchart(
    nodes: Array<{ id: string; label: string }>,
    connections: Array<{ from: string; to: string }>
  ): string {
    const lines: string[] = [];
    const _nodeMap = new Map(nodes.map(n => [n.id, n.label]));

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const label = node.label;
      const boxWidth = label.length + 4;

      lines.push(`┌${'─'.repeat(boxWidth)}┐`);
      lines.push(`│  ${label}  │`);
      lines.push(`└${'─'.repeat(boxWidth)}┘`);

      // Check if there's a connection to next node
      const hasConnection = connections.some(c => c.from === node.id);
      if (hasConnection && i < nodes.length - 1) {
        lines.push(`${''.padStart(Math.floor(boxWidth / 2) + 1)}│`);
        lines.push(`${''.padStart(Math.floor(boxWidth / 2) + 1)}▼`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate ASCII tree
   */
  generateAsciiTree(
    root: string,
    children: Array<{ name: string; children?: Array<{ name: string }> }>
  ): string {
    const lines = [root];

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      const prefix = isLast ? '└── ' : '├── ';

      lines.push(prefix + child.name);

      if (child.children) {
        for (let j = 0; j < child.children.length; j++) {
          const subChild = child.children[j];
          const subPrefix = isLast ? '    ' : '│   ';
          const subConnector = j === child.children.length - 1 ? '└── ' : '├── ';
          lines.push(subPrefix + subConnector + subChild.name);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Convert Mermaid to ASCII (basic conversion)
   */
  private mermaidToAscii(mermaidCode: string): string {
    // Extract basic structure from Mermaid code
    const lines = mermaidCode.split('\n');
    const type = lines[0].toLowerCase();

    if (type.includes('flowchart') || type.includes('graph')) {
      return this.flowchartToAscii(lines.slice(1));
    } else if (type.includes('sequencediagram')) {
      return this.sequenceToAscii(lines.slice(1));
    } else if (type.includes('pie')) {
      return this.pieToAscii(lines);
    }

    // Default: return formatted code
    return `ASCII conversion not available for this diagram type.\n\nMermaid code:\n${mermaidCode}`;
  }

  /**
   * Convert flowchart to ASCII
   */
  private flowchartToAscii(lines: string[]): string {
    const nodes: Array<{ id: string; label: string }> = [];
    const connections: Array<{ from: string; to: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Match node definition: id[label] or id(label) etc.
      const nodeMatch = trimmed.match(/^(\w+)[[({]([^\])}]+)[\])}]$/);
      if (nodeMatch) {
        nodes.push({ id: nodeMatch[1], label: nodeMatch[2] });
        continue;
      }

      // Match connection: id1 --> id2
      const connMatch = trimmed.match(/^(\w+)\s*[-=.]+[>)}\]]+\s*(\w+)/);
      if (connMatch) {
        connections.push({ from: connMatch[1], to: connMatch[2] });
      }
    }

    if (nodes.length === 0) {
      return 'No nodes found in flowchart';
    }

    return this.generateAsciiFlowchart(nodes, connections);
  }

  /**
   * Convert sequence diagram to ASCII
   */
  private sequenceToAscii(lines: string[]): string {
    const participants: string[] = [];
    const messages: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      const partMatch = trimmed.match(/participant\s+(\w+)/);
      if (partMatch) {
        participants.push(partMatch[1]);
        continue;
      }

      const msgMatch = trimmed.match(/(\w+)\s*[-=.]+[>)}\]]+\s*(\w+)\s*:\s*(.+)/);
      if (msgMatch) {
        messages.push(`${msgMatch[1]} -> ${msgMatch[2]}: ${msgMatch[3]}`);
      }
    }

    const result: string[] = [];

    // Draw participants
    const pLine = participants.map(p => `[${p}]`).join('     ');
    result.push(pLine);
    result.push(participants.map(p => '  |  '.padStart(p.length + 2)).join('     '));

    // Draw messages
    for (const msg of messages) {
      result.push(`  ${msg}`);
    }

    return result.join('\n');
  }

  /**
   * Convert pie chart to ASCII
   */
  private pieToAscii(lines: string[]): string {
    const data: Array<{ label: string; value: number }> = [];
    let title = 'Pie Chart';

    for (const line of lines) {
      const titleMatch = line.match(/title\s+(.+)/i);
      if (titleMatch) {
        title = titleMatch[1];
        continue;
      }

      const dataMatch = line.match(/"([^"]+)"\s*:\s*(\d+)/);
      if (dataMatch) {
        data.push({ label: dataMatch[1], value: parseInt(dataMatch[2]) });
      }
    }

    const total = data.reduce((sum, d) => sum + d.value, 0);
    const maxLabelLen = Math.max(...data.map(d => d.label.length));

    const result = [title, '─'.repeat(40)];

    for (const item of data) {
      const pct = ((item.value / total) * 100).toFixed(1);
      const barLen = Math.round((item.value / total) * 20);
      const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
      result.push(`${item.label.padEnd(maxLabelLen)} │${bar}│ ${pct}%`);
    }

    return result.join('\n');
  }

  /**
   * Check if Mermaid CLI is available
   */
  private async checkMermaidCli(): Promise<boolean> {
    try {
      execSync('mmdc --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Render diagram with Mermaid CLI
   */
  private async renderWithMermaidCli(
    mermaidCode: string,
    outputPath: string,
    options: Partial<DiagramOptions>
  ): Promise<ToolResult> {
    return new Promise((resolve) => {
      const tempFile = path.join(this.outputDir, `temp_${Date.now()}.mmd`);
      fs.writeFileSync(tempFile, mermaidCode);

      const args = ['-i', tempFile, '-o', outputPath];

      if (options.theme) {
        args.push('-t', options.theme);
      }
      if (options.width) {
        args.push('-w', options.width.toString());
      }
      if (options.height) {
        args.push('-H', options.height.toString());
      }

      const mmdc = spawn('mmdc', args);

      mmdc.on('close', (code) => {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({
            success: true,
            output: `Diagram generated: ${outputPath}`,
            data: {
              content: fs.readFileSync(outputPath, 'utf8'),
              format: path.extname(outputPath).slice(1),
              path: outputPath,
              mermaidCode
            }
          });
        } else {
          resolve({
            success: false,
            error: `Mermaid CLI failed with code ${code}`
          });
        }
      });

      mmdc.on('error', (err) => {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        resolve({
          success: false,
          error: `Mermaid CLI error: ${err.message}`
        });
      });
    });
  }

  /**
   * List generated diagrams
   */
  listDiagrams(): ToolResult {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return {
          success: true,
          output: 'No diagrams generated yet'
        };
      }

      const files = fs.readdirSync(this.outputDir);
      const diagrams = files.filter(f => /\.(svg|png|mmd)$/i.test(f));

      if (diagrams.length === 0) {
        return {
          success: true,
          output: 'No diagrams found'
        };
      }

      const list = diagrams.map(f => {
        const fullPath = path.join(this.outputDir, f);
        const stats = fs.statSync(fullPath);
        return `  📊 ${f} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `Diagrams in ${this.outputDir}:\n${list}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list diagrams: ${error.message}`
      };
    }
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
