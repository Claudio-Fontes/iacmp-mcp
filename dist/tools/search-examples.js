import { search } from '../db/bm25.js';
import { listExamples, countExamples } from '../db/repository.js';
function formatResult(ex) {
    // Nível de confiança explícito: validado em deploy real vs gerado por IA. O
    // LLM usa isso para calibrar o quanto confiar no padrão.
    const trust = ex.validated
        ? '✓ validado em deploy real'
        : '○ gerado por IA (não deployado — bom ponto de partida, revise antes de usar)';
    const sections = [
        `# ${ex.title}  [${ex.provider}]  ${trust}`,
        `constructs: ${ex.constructs.join(', ')} | tags: ${ex.tags.join(', ')}`,
        '',
        '## Stacks',
    ];
    for (const [p, c] of Object.entries(ex.content.stacks)) {
        sections.push(`### ${p}\n\`\`\`typescript\n${c}\n\`\`\``);
    }
    if (Object.keys(ex.content.handlers).length > 0) {
        sections.push('## Handlers');
        for (const [p, c] of Object.entries(ex.content.handlers)) {
            sections.push(`### ${p}\n\`\`\`typescript\n${c}\n\`\`\``);
        }
    }
    const notes = Array.isArray(ex.content.notes)
        ? ex.content.notes
        : (ex.content.notes ? [ex.content.notes] : []);
    if (notes.length > 0) {
        sections.push(ex.validated ? '## Regras críticas validadas' : '## Regras (do exemplo gerado)');
        notes.forEach(n => sections.push(`- ${n}`));
    }
    return sections.join('\n');
}
export function handleSearchExamples(args) {
    const results = search(args.query, { provider: args.provider, limit: args.limit ?? 3 });
    if (results.length === 0) {
        const total = countExamples();
        return `Nenhum exemplo encontrado para "${args.query}".\nTotal no banco: ${total} exemplos. Use list_examples para ver todos.`;
    }
    return results.map(formatResult).join('\n\n---\n\n');
}
export function handleListExamples(args) {
    const rows = listExamples(args.provider);
    const total = countExamples();
    const nValidated = rows.filter(r => r.validated).length;
    const lines = rows.map(r => `- ${r.validated ? '✓' : '○'} **${r.id}** [${r.provider}]: ${r.title} | ${r.tags.join(', ')}`);
    return `Total: ${total} exemplos (${nValidated} validados em deploy, ${rows.length - nValidated} gerados) — ✓ validado, ○ gerado\n\n${lines.join('\n')}`;
}
