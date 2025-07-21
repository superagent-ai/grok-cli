export { StdioTransport } from './stdio';
export { SSETransport } from './sse';
export { HTTPSTransport } from './https';

import { MCPTransport, MCPServerConfig } from '../types';
import { StdioTransport } from './stdio';
import { SSETransport } from './sse';
import { HTTPSTransport } from './https';

export function createTransport(serverId: string, config: MCPServerConfig): MCPTransport {
  switch (config.transport) {
    case 'stdio':
      return new StdioTransport(serverId, config);
    case 'sse':
      return new SSETransport(serverId, config);
    case 'https':
      return new HTTPSTransport(serverId, config);
    default:
      throw new Error(`Unsupported transport type: ${(config as any).transport}`);
  }
}