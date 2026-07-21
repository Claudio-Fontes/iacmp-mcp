export const s3PresignedUrl = {
    id: 'aws-s3-presigned-url',
    title: 'S3 com presigned URL para upload direto do browser',
    tags: ['aws', 's3', 'presigned-url', 'lambda', 'upload', 's3-request-presigner'],
    validated: true,
    stacks: {
        'stacks/storage/bucket-stack.ts': `import { Stack, Storage } from '@iacmp/core';
const stack = new Stack('uploads-storage');
new Storage.Bucket(stack, 'UploadsBucket', { versioning: false });
export default stack;`,
        'stacks/compute/api-stack.ts': `import { Stack, Fn, Policy, ref } from '@iacmp/core';
const stack = new Stack('uploads-api');
new Fn.Lambda(stack, 'GetUploadUrlFn', {
  runtime: 'nodejs20',
  handler: 'dist/getUploadUrl.handler',
  code: '.',
  environment: { BUCKET_NAME: ref('UploadsBucket', 'Name') },
});
new Policy.IAM(stack, 'GetUploadUrlFnPolicy', {
  attachTo: 'GetUploadUrlFn', attachType: 'lambda',
  statements: [{ effect: 'Allow', actions: ['s3:PutObject', 's3:GetObject'], resources: [ref('UploadsBucket', 'Arn')] }],
});
export default stack;`,
    },
    handlers: {
        'src/getUploadUrl.ts': `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const s3 = new S3Client({});
export async function handler(event: any) {
  const key = event.queryStringParameters?.key ?? \`upload-\${Date.now()}\`;
  // CORRETO: getSignedUrl recebe um COMMAND object (new PutObjectCommand)
  // NUNCA: getSignedUrl(s3, { Bucket, Key, ExpiresIn }) — compila mas falha com EndpointError em runtime
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key }), { expiresIn: 300 });
  return { statusCode: 200, body: JSON.stringify({ url, key }), headers: { 'Access-Control-Allow-Origin': '*' } };
}`,
    },
    notes: [
        'getSignedUrl(s3, new PutObjectCommand({...}), { expiresIn }) — SEMPRE instância do Command, NUNCA objeto literal',
        'Objeto literal { Bucket, Key, ExpiresIn } compila sem erro mas falha em runtime com "EndpointError: A region must be set"',
        '@aws-sdk/s3-request-presigner é pacote separado — incluir no nextSteps: npm install @aws-sdk/s3-request-presigner',
        'Policy.IAM precisa de s3:PutObject para upload e s3:GetObject para download',
        'resources: [ref("UploadsBucket","Arn")] — NUNCA string com ARN literal',
        "environment: BUCKET_NAME usa ref('UploadsBucket', 'Name') — NUNCA o ID lógico como string literal",
    ],
};
