import { dynamodbCrud } from './aws/dynamodb-crud.js';
import { s3LambdaTrigger } from './aws/s3-lambda-trigger.js';
import { cosmosTableCrud } from './azure/cosmos-table-crud.js';
export const ALL_EXAMPLES = [
    dynamodbCrud,
    s3LambdaTrigger,
    cosmosTableCrud,
];
// BM25-lite: score por overlap de tokens entre query e tags+title
export function searchExamples(query, limit = 3) {
    const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
    return ALL_EXAMPLES
        .map(ex => {
        const haystack = [ex.title, ...ex.tags, ...ex.notes].join(' ').toLowerCase();
        const score = tokens.reduce((s, t) => s + (haystack.split(t).length - 1), 0);
        return { ex, score };
    })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(r => r.ex);
}
export function getExampleById(id) {
    return ALL_EXAMPLES.find(e => e.id === id);
}
