import { createMockPandaDoc, createMockS3, createMockStripe, listen } from './index.js';

const env = process.env;
const stripe = createMockStripe({
  secretKey: env.STRIPE_SECRET_KEY || 'sk_test_mock',
  webhookSecret: env.STRIPE_WEBHOOK_SECRET || 'whsec_mock',
  webhookUrl: env.STRIPE_WEBHOOK_URL || null,
});
const pandadoc = createMockPandaDoc({
  apiKey: env.PANDADOC_API_KEY || 'pandadoc_mock_key',
  sharedKey: env.PANDADOC_WEBHOOK_KEY || 'pandadoc_mock_shared',
  webhookUrl: env.PANDADOC_WEBHOOK_URL || null,
  templates: [
    { id: 'tpl-sale-agreement', name: 'Sale agreement' },
    { id: 'tpl-payment-plan-addendum', name: 'Payment plan addendum' },
  ],
});
const s = await listen(
  stripe.app,
  Number(env.MOCK_STRIPE_PORT || 12111),
  env.MOCK_HOST || '127.0.0.1',
);
const p = await listen(
  pandadoc.app,
  Number(env.MOCK_PANDADOC_PORT || 12112),
  env.MOCK_HOST || '127.0.0.1',
);
// eslint-disable-next-line no-console -- command-line tool
console.log(`mock stripe   ${s.url}\nmock pandadoc ${p.url}`);
const s3 = createMockS3({
  bucket: env.S3_BUCKET || 'estateops',
  accessKeyId: env.S3_ACCESS_KEY_ID || 'mock-access-key',
  secretAccessKey: env.S3_SECRET_ACCESS_KEY || 'mock-secret-key',
});
const b = await listen(s3.app, Number(env.MOCK_S3_PORT || 12113), env.MOCK_HOST || '127.0.0.1');
// eslint-disable-next-line no-console -- command-line tool
console.log(`mock s3       ${b.url}`);
