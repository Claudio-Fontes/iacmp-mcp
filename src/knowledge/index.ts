import { dynamodbCrud } from './aws/dynamodb-crud.js';
import { s3LambdaTrigger } from './aws/s3-lambda-trigger.js';
import { s3PresignedUrl } from './aws/s3-presigned-url.js';
import { rdsLambdaVpc } from './aws/rds-lambda-vpc.js';
import { cacheRedisLambda } from './aws/cache-redis-lambda.js';
import { staticSiteCloudfront } from './aws/static-site-cloudfront.js';
import { cosmosTableCrud } from './azure/cosmos-table-crud.js';
import { postgresqlFlexible } from './azure/postgresql-flexible.js';
import { blobTriggerContainer } from './azure/blob-trigger-container.js';

export interface Example {
  id: string;
  title: string;
  tags: string[];
  validated: boolean;
  stacks: Record<string, string>;
  handlers: Record<string, string>;
  notes: string[];
}

export const ALL_EXAMPLES: Example[] = [
  dynamodbCrud,
  s3LambdaTrigger,
  s3PresignedUrl,
  rdsLambdaVpc,
  cacheRedisLambda,
  staticSiteCloudfront,
  cosmosTableCrud,
  postgresqlFlexible,
  blobTriggerContainer,
];

// BM25-lite: score por overlap de tokens entre query e tags+title+notes
export function searchExamples(query: string, limit = 3): Example[] {
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

export function getExampleById(id: string): Example | undefined {
  return ALL_EXAMPLES.find(e => e.id === id);
}
