export const s3LambdaTrigger = {
    id: 'aws-s3-lambda-trigger',
    title: 'S3 Bucket com trigger Lambda (ObjectCreated)',
    tags: ['aws', 's3', 'lambda', 'trigger', 'event', 'policy-iam'],
    validated: true,
    stacks: {
        'stacks/storage/bucket-stack.ts': `import { Stack, Storage } from '@iacmp/core';
const stack = new Stack('uploads-storage');
new Storage.Bucket(stack, 'UploadsBucket', {
  versioning: false,
  trigger: { lambdaId: 'ProcessFileFn', events: ['s3:ObjectCreated:*'] },
});
export default stack;`,
        'stacks/compute/processor-stack.ts': `import { Stack, Fn, Policy, ref } from '@iacmp/core';
const stack = new Stack('uploads-processor');
new Fn.Lambda(stack, 'ProcessFileFn', {
  runtime: 'nodejs20',
  handler: 'dist/processFile.handler',
  code: '.',
  environment: { BUCKET_NAME: 'UploadsBucket' },
});
new Policy.IAM(stack, 'ProcessFileFnPolicy', {
  attachTo: 'ProcessFileFn', attachType: 'lambda',
  statements: [
    { effect: 'Allow', actions: ['s3:GetObject', 's3:DeleteObject'], resources: [ref('UploadsBucket', 'Arn')] },
  ],
});
export default stack;`,
    },
    handlers: {
        'src/processFile.ts': `import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
const s3 = new S3Client({});
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\\+/g, ' '));
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await obj.Body?.transformToString();
    console.log('Processando', key, body?.slice(0, 100));
  }
};`,
    },
    notes: [
        'bucket e key vêm de event.Records[n].s3 — NUNCA de env var no trigger',
        'BUCKET_NAME na env var é para operações de output (write em outro bucket)',
        'Storage.Bucket e Fn.Lambda devem estar em stacks SEPARADAS para evitar ciclo CloudFormation',
        'trigger.lambdaId referencia o ID lógico da Lambda em outra stack',
    ],
};
