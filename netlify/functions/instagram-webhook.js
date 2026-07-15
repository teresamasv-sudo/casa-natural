import { createHmac } from 'node:crypto';
import { processWebhook, createFollowerVerificationProvider } from '../../src/lib/instagramAutomation.js';

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) {
    return true;
  }

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return signature === `sha256=${expected}`;
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    const mode = event.queryStringParameters?.['hub.mode'];
    const token = event.queryStringParameters?.['hub.verify_token'];
    const challenge = event.queryStringParameters?.['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return {
        statusCode: 200,
        body: challenge || '',
      };
    }

    return {
      statusCode: 403,
      body: 'Forbidden',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signature = event.headers?.['x-hub-signature-256'] || event.headers?.['X-Hub-Signature-256'];
  const isValid = verifySignature(event.body || '', signature, process.env.META_APP_SECRET);
  if (!isValid) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    await processWebhook(payload, {
      accessToken: process.env.META_ACCESS_TOKEN,
      pageId: process.env.META_PAGE_ID,
      followerVerificationProvider: createFollowerVerificationProvider(),
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Instagram webhook processing failed', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
