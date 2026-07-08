export const staticSiteCloudfront = {
    id: 'aws-static-site-cloudfront',
    title: 'SPA React + S3 + CloudFront CDN',
    tags: ['aws', 's3', 'cloudfront', 'cdn', 'react', 'spa', 'static-site'],
    validated: true,
    stacks: {
        'stacks/storage/frontend-stack.ts': `import { Stack, Storage, Network } from '@iacmp/core';
const stack = new Stack('frontend-cdn');
// Storage.Bucket e Network.CDN na MESMA stack — bucketRef é referência local (GetAtt)
new Storage.Bucket(stack, 'FrontendBucket', {
  versioning: false,
  websiteHosting: true,
});
new Network.CDN(stack, 'FrontendCDN', {
  bucketRef: 'FrontendBucket',
  defaultRootObject: 'index.html',
});
export default stack;`,
    },
    handlers: {},
    notes: [
        'Storage.Bucket e Network.CDN devem estar na MESMA stack — bucketRef é GetAtt local, não cross-stack',
        'NUNCA websiteHosting: true com bucketRef em stacks separadas — bucketRef exige GetAtt',
        'Network.CDN (não Storage.CDN — não existe)',
        'Sem certificateArn o CloudFront usa *.cloudfront.net — NUNCA gerar placeholder de ARN',
        'Para SPA com React Router: adicionar errorPage: "/index.html" nas props do CDN',
    ],
};
