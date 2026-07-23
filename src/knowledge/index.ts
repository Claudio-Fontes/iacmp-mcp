import { dynamodbCrud } from './aws/dynamodb-crud.js';
import { s3LambdaTrigger } from './aws/s3-lambda-trigger.js';
import { s3PresignedUrl } from './aws/s3-presigned-url.js';
import { rdsLambdaVpc } from './aws/rds-lambda-vpc.js';
import { cacheRedisLambda } from './aws/cache-redis-lambda.js';
import { staticSiteCloudfront } from './aws/static-site-cloudfront.js';
import { sqsWorker } from './aws/sqs-worker.js';
import { snsFanout } from './aws/sns-fanout.js';
import { eventbridgeCron } from './aws/eventbridge-cron.js';
import { secretsManagerApiKey } from './aws/secrets-manager-multi-env.js';
import { fargateAlbAutoscale } from './aws/fargate-alb-autoscale.js';
import { jwtAuthorizer } from './aws/jwt-authorizer.js';
import { stepFunctionsApproval } from './aws/step-functions-approval.js';
import { documentdbLambdaVpc } from './aws/documentdb-lambda-vpc.js';
import { cosmosTableCrud } from './azure/cosmos-table-crud.js';
import { postgresqlFlexible } from './azure/postgresql-flexible.js';
import { blobTriggerContainer } from './azure/blob-trigger-container.js';
import { cacheRedis } from './azure/cache-redis.js';
import { postgresPrivateVnet } from './azure/postgres-private-vnet.js';
import { staticSiteCdn } from './azure/static-site-cdn.js';
import { containerAppsIngress } from './azure/container-apps-ingress.js';
import { LEGACY_EXAMPLES } from './legacy/examples.js';

export interface Example {
  id: string;
  title: string;
  tags: string[];
  validated: boolean;
  stacks: Record<string, string>;
  handlers: Record<string, string>;
  notes: string[];
  /** Legados: provider/constructs vêm explícitos (não derivados das tags). */
  provider?: string;
  constructs?: string[];
}

export const ALL_EXAMPLES: Example[] = [
  dynamodbCrud,
  s3LambdaTrigger,
  s3PresignedUrl,
  rdsLambdaVpc,
  cacheRedisLambda,
  staticSiteCloudfront,
  sqsWorker,
  snsFanout,
  eventbridgeCron,
  secretsManagerApiKey,
  fargateAlbAutoscale,
  jwtAuthorizer,
  stepFunctionsApproval,
  documentdbLambdaVpc,
  cosmosTableCrud,
  postgresqlFlexible,
  blobTriggerContainer,
  cacheRedis,
  postgresPrivateVnet,
  staticSiteCdn,
  containerAppsIngress,
  // 105 legados sanados (bulk do insert-batch) — fonte única versionada.
  ...LEGACY_EXAMPLES,
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
