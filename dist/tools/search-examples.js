import { searchExamples, getExampleById, ALL_EXAMPLES } from '../knowledge/index.js';
function formatExample(ex) {
    const sections = [
        `# ${ex.title}`,
        `tags: ${ex.tags.join(', ')}`,
        '',
        '## Stacks',
    ];
    for (const [path, content] of Object.entries(ex.stacks)) {
        sections.push(`### ${path}\n\`\`\`typescript\n${content}\n\`\`\``);
    }
    if (Object.keys(ex.handlers).length > 0) {
        sections.push('## Handlers');
        for (const [path, content] of Object.entries(ex.handlers)) {
            sections.push(`### ${path}\n\`\`\`typescript\n${content}\n\`\`\``);
        }
    }
    if (ex.notes.length > 0) {
        sections.push('## Regras críticas validadas em deploy real');
        ex.notes.forEach(n => sections.push(`- ${n}`));
    }
    return sections.join('\n');
}
export function handleSearchExamples(args) {
    const results = searchExamples(args.query, args.limit ?? 3);
    if (results.length === 0) {
        return `Nenhum exemplo encontrado para "${args.query}".\nExemplos disponíveis: ${ALL_EXAMPLES.map(e => `${e.id} (${e.tags.join(', ')})`).join('; ')}`;
    }
    return results.map(formatExample).join('\n\n---\n\n');
}
export function handleGetExample(args) {
    const ex = getExampleById(args.id);
    if (!ex)
        return `Exemplo "${args.id}" não encontrado. IDs disponíveis: ${ALL_EXAMPLES.map(e => e.id).join(', ')}`;
    return formatExample(ex);
}
export function handleListExamples() {
    return ALL_EXAMPLES.map(e => `- **${e.id}**: ${e.title} [${e.tags.join(', ')}]`).join('\n');
}
