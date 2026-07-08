import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export type TransportMode = 'stdio' | 'http';

export async function startTransport(server: Server, mode: TransportMode = 'stdio'): Promise<void> {
  if (mode === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }
  // HTTP transport — futuro: importar StreamableHTTPServerTransport
  throw new Error('HTTP transport not yet implemented — use stdio');
}
