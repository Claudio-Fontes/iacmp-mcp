export const cosmosTableCrud = {
    id: 'azure-cosmos-table-crud',
    title: 'Azure Cosmos DB Table API (DynamoDB equivalente) com Lambda + APIM',
    tags: ['azure', 'cosmos', 'dynamodb', 'lambda', 'crud', 'apim', 'data-tables'],
    validated: true,
    stacks: {
        'stacks/database/items-stack.ts': `import { Stack, Database } from '@iacmp/core';
const stack = new Stack('items-db');
new Database.DynamoDB(stack, 'ItemsTable', {
  partitionKey: 'id',
  partitionKeyType: 'S',
  billingMode: 'PAY_PER_REQUEST',
});
export default stack;`,
        'stacks/compute/api-stack.ts': `import { Stack, Fn, ref } from '@iacmp/core';
const stack = new Stack('items-api');
const env = {
  COSMOS_CONNECTION: ref('ItemsTable', 'ConnectionString'),
  TABLE_NAME: ref('ItemsTable', 'Name'),
};
new Fn.Lambda(stack, 'CreateItemFn', { runtime: 'nodejs20', handler: 'dist/createItem.handler', code: '.', environment: env });
new Fn.Lambda(stack, 'GetItemFn',    { runtime: 'nodejs20', handler: 'dist/getItem.handler',    code: '.', environment: env });
new Fn.Lambda(stack, 'ListItemsFn',  { runtime: 'nodejs20', handler: 'dist/listItems.handler',  code: '.', environment: env });
new Fn.Lambda(stack, 'UpdateItemFn', { runtime: 'nodejs20', handler: 'dist/updateItem.handler', code: '.', environment: env });
new Fn.Lambda(stack, 'DeleteItemFn', { runtime: 'nodejs20', handler: 'dist/deleteItem.handler', code: '.', environment: env });
export default stack;`,
        'stacks/network/apim-stack.ts': `import { Stack, Fn } from '@iacmp/core';
const stack = new Stack('items-gw');
new Fn.ApiGateway(stack, 'ItemsApi', {
  name: 'items-api', type: 'HTTP', cors: true,
  stageName: 'api',
  routes: [
    { method: 'POST',   path: '/items',      lambdaId: 'CreateItemFn' },
    { method: 'GET',    path: '/items',      lambdaId: 'ListItemsFn' },
    { method: 'GET',    path: '/items/{id}', lambdaId: 'GetItemFn' },
    { method: 'PUT',    path: '/items/{id}', lambdaId: 'UpdateItemFn' },
    { method: 'DELETE', path: '/items/{id}', lambdaId: 'DeleteItemFn' },
  ],
});
export default stack;`,
    },
    handlers: {
        'src/createItem.ts': `import { TableClient } from '@azure/data-tables';
import { randomUUID } from 'crypto';
const client = TableClient.fromConnectionString(process.env.COSMOS_CONNECTION!, process.env.TABLE_NAME!);
export const handler = async (event: any) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body ?? {});
  const id = randomUUID();
  const { id: _id, ...rest } = body; // 'id' é reservado na Table API
  await client.createEntity({ partitionKey: 'items', rowKey: id, ...rest });
  return { statusCode: 201, body: JSON.stringify({ id, ...rest }) };
};`,
        'src/listItems.ts': `import { TableClient } from '@azure/data-tables';
const client = TableClient.fromConnectionString(process.env.COSMOS_CONNECTION!, process.env.TABLE_NAME!);
export const handler = async () => {
  const items: any[] = [];
  for await (const e of client.listEntities()) items.push({ id: e.rowKey, ...e });
  return { statusCode: 200, body: JSON.stringify(items) };
};`,
        'src/getItem.ts': `import { TableClient } from '@azure/data-tables';
const client = TableClient.fromConnectionString(process.env.COSMOS_CONNECTION!, process.env.TABLE_NAME!);
export const handler = async (event: any) => {
  const id = event.pathParameters?.id ?? event.path?.split('/').pop();
  const e = await client.getEntity('items', id);
  return { statusCode: 200, body: JSON.stringify({ id: e.rowKey, ...e }) };
};`,
        'src/updateItem.ts': `import { TableClient } from '@azure/data-tables';
const client = TableClient.fromConnectionString(process.env.COSMOS_CONNECTION!, process.env.TABLE_NAME!);
export const handler = async (event: any) => {
  const id = event.pathParameters?.id ?? event.path?.split('/').pop();
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body ?? {});
  const { id: _id, ...rest } = body;
  await client.updateEntity({ partitionKey: 'items', rowKey: id, ...rest }, 'Replace');
  return { statusCode: 200, body: JSON.stringify({ id, ...rest }) };
};`,
        'src/deleteItem.ts': `import { TableClient } from '@azure/data-tables';
const client = TableClient.fromConnectionString(process.env.COSMOS_CONNECTION!, process.env.TABLE_NAME!);
export const handler = async (event: any) => {
  const id = event.pathParameters?.id ?? event.path?.split('/').pop();
  await client.deleteEntity('items', id);
  return { statusCode: 204, body: '' };
};`,
    },
    notes: [
        'Azure: env vars usam ref() — COSMOS_CONNECTION: ref("ItemsTable","ConnectionString"), TABLE_NAME: ref("ItemsTable","Name")',
        'stageName: "api" no ApiGateway — NUNCA "" (string vazia causa 404)',
        '"id" é propriedade RESERVADA na Table API — sempre excluir do spread com { id: _id, ...rest }',
        'listEntities() é AsyncIterable — SEMPRE use for await',
        'Policy.IAM NÃO é necessária no Azure para Cosmos Table — connection string já autentica',
        'NUNCA @aws-sdk/* em projeto Azure',
    ],
};
