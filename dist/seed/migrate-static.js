// Migra os exemplos estáticos (src/knowledge/**) para o SQLite
import { upsertExample } from '../db/repository.js';
import { ALL_EXAMPLES } from '../knowledge/index.js';
export function migrateStatic() {
    let count = 0;
    for (const ex of ALL_EXAMPLES) {
        // Legados trazem provider/constructs explícitos; curados derivam das tags.
        const provider = ex.provider ?? ex.tags.find(t => ['aws', 'azure', 'gcp'].includes(t)) ?? 'aws';
        const constructs = ex.constructs ?? ex.tags.filter(t => ['lambda', 'dynamodb', 's3', 'rds', 'redis', 'cloudfront', 'cosmos', 'postgresql',
            'container', 'apim', 'api-gateway', 'policy-iam', 'event-grid', 'blob'].includes(t));
        upsertExample({
            id: ex.id,
            title: ex.title,
            provider,
            constructs,
            tags: ex.tags,
            content: { stacks: ex.stacks, handlers: ex.handlers, notes: ex.notes },
            validated: ex.validated,
        });
        count++;
    }
    return count;
}
