import type { Example } from '../index.js';

export const dynamodbCrud: Example = {
  id: 'aws-dynamodb-crud',
  title: 'DynamoDB CRUD com Lambda + API Gateway',
  tags: ['aws', 'dynamodb', 'lambda', 'crud', 'api-gateway', 'policy-iam'],
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

    'stacks/compute/api-stack.ts': `import { Stack, Fn, Policy, ref } from '@iacmp/core';
const stack = new Stack('items-api');
new Fn.Lambda(stack, 'CreateItemFn', {
  runtime: 'nodejs20',
  handler: 'dist/createItem.handler',
  code: '.',
  environment: { TABLE_NAME: ref('ItemsTable', 'Name') },
});
new Fn.Lambda(stack, 'GetItemFn', {
  runtime: 'nodejs20',
  handler: 'dist/getItem.handler',
  code: '.',
  environment: { TABLE_NAME: ref('ItemsTable', 'Name') },
});
new Fn.Lambda(stack, 'ListItemsFn', {
  runtime: 'nodejs20',
  handler: 'dist/listItems.handler',
  code: '.',
  environment: { TABLE_NAME: ref('ItemsTable', 'Name') },
});
new Fn.Lambda(stack, 'UpdateItemFn', {
  runtime: 'nodejs20',
  handler: 'dist/updateItem.handler',
  code: '.',
  environment: { TABLE_NAME: ref('ItemsTable', 'Name') },
});
new Fn.Lambda(stack, 'DeleteItemFn', {
  runtime: 'nodejs20',
  handler: 'dist/deleteItem.handler',
  code: '.',
  environment: { TABLE_NAME: ref('ItemsTable', 'Name') },
});
new Policy.IAM(stack, 'CreateItemFnPolicy', {
  attachTo: 'CreateItemFn', attachType: 'lambda',
  statements: [{ effect: 'Allow', actions: ['dynamodb:PutItem'], resources: [ref('ItemsTable', 'Arn')] }],
});
new Policy.IAM(stack, 'GetItemFnPolicy', {
  attachTo: 'GetItemFn', attachType: 'lambda',
  statements: [{ effect: 'Allow', actions: ['dynamodb:GetItem'], resources: [ref('ItemsTable', 'Arn')] }],
});
new Policy.IAM(stack, 'ListItemsFnPolicy', {
  attachTo: 'ListItemsFn', attachType: 'lambda',
  statements: [{ effect: 'Allow', actions: ['dynamodb:Scan'], resources: [ref('ItemsTable', 'Arn')] }],
});
new Policy.IAM(stack, 'UpdateItemFnPolicy', {
  attachTo: 'UpdateItemFn', attachType: 'lambda',
  statements: [{ effect: 'Allow', actions: ['dynamodb:UpdateItem'], resources: [ref('ItemsTable', 'Arn')] }],
});
new Policy.IAM(stack, 'DeleteItemFnPolicy', {
  attachTo: 'DeleteItemFn', attachType: 'lambda',
  statements: [{ effect: 'Allow', actions: ['dynamodb:DeleteItem'], resources: [ref('ItemsTable', 'Arn')] }],
});
export default stack;`,

    'stacks/network/api-gateway-stack.ts': `import { Stack, Fn } from '@iacmp/core';
const stack = new Stack('items-gw');
new Fn.ApiGateway(stack, 'ItemsApi', {
  name: 'items-api', type: 'HTTP', cors: true,
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
    'src/createItem.ts': `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event: any) => {
  const body = JSON.parse(event.body ?? '{}');
  const id = body.id ?? crypto.randomUUID();
  await doc.send(new PutCommand({ TableName: process.env.TABLE_NAME, Item: { id, ...body } }));
  return { statusCode: 201, body: JSON.stringify({ id, ...body }), headers: { 'Access-Control-Allow-Origin': '*' } };
};`,
    'src/getItem.ts': `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event: any) => {
  const id = event.pathParameters?.id ?? '';
  const res = await doc.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { id } }));
  if (!res.Item) return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  return { statusCode: 200, body: JSON.stringify(res.Item), headers: { 'Access-Control-Allow-Origin': '*' } };
};`,
    'src/listItems.ts': `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async () => {
  const res = await doc.send(new ScanCommand({ TableName: process.env.TABLE_NAME }));
  return { statusCode: 200, body: JSON.stringify(res.Items ?? []), headers: { 'Access-Control-Allow-Origin': '*' } };
};`,
    'src/updateItem.ts': `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event: any) => {
  const id = event.pathParameters?.id ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const fields = Object.entries(body).filter(([k]) => k !== 'id');
  const expr = 'SET ' + fields.map(([k], i) => \`#f\${i} = :v\${i}\`).join(', ');
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};
  fields.forEach(([k, v], i) => { names[\`#f\${i}\`] = k; vals[\`:v\${i}\`] = v; });
  await doc.send(new UpdateCommand({ TableName: process.env.TABLE_NAME, Key: { id }, UpdateExpression: expr, ExpressionAttributeNames: names, ExpressionAttributeValues: vals }));
  return { statusCode: 200, body: JSON.stringify({ id, ...body }), headers: { 'Access-Control-Allow-Origin': '*' } };
};`,
    'src/deleteItem.ts': `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event: any) => {
  const id = event.pathParameters?.id ?? '';
  await doc.send(new DeleteCommand({ TableName: process.env.TABLE_NAME, Key: { id } }));
  return { statusCode: 200, body: JSON.stringify({ deleted: id }), headers: { 'Access-Control-Allow-Origin': '*' } };
};`,
  },
  notes: [
    'Policy.IAM usa ref(TableId, "Arn") — NUNCA string "NomeTabela" nem "NomeTabela/*"',
    'Policy separada por Lambda — nunca uma única policy compartilhada',
    'actions mapeiam 1:1 com SDK commands: PutCommand→PutItem, GetCommand→GetItem, etc.',
    'DocumentClient (@aws-sdk/lib-dynamodb) — NUNCA client low-level do @aws-sdk/client-dynamodb',
    'crypto.randomUUID() para id — não uuid de lib externa',
  ],
};
