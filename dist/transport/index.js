import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export async function startTransport(server, mode = 'stdio') {
    if (mode === 'stdio') {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        return;
    }
    // HTTP transport — futuro: importar StreamableHTTPServerTransport
    throw new Error('HTTP transport not yet implemented — use stdio');
}
