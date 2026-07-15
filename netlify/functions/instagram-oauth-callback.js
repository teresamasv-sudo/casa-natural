import { upsertInstagramOAuthToken, ensureInstagramOAuthTable } from '../../src/lib/postgresStore.js';

function buildRedirectHtml(message, redirectPath = '/') {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="2;url=${redirectPath}" />
    <title>Instagram OAuth callback</title>
  </head>
  <body>
    <p>${message}</p>
  </body>
</html>`;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code = event.queryStringParameters?.code;
  const error = event.queryStringParameters?.error;
  const state = event.queryStringParameters?.state;

  if (error) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: buildRedirectHtml('Instagram authorization was cancelled or failed.'),
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: buildRedirectHtml('Missing Instagram authorization code.'),
    };
  }

  try {
    await ensureInstagramOAuthTable();

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;

    if (!appId || !appSecret) {
      return {
        statusCode: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: buildRedirectHtml('Instagram app credentials are not configured.'),
      };
    }

    const redirectUri = `${process.env.URL || process.env.SITE_URL || 'http://localhost:8888'}/.netlify/functions/instagram-oauth-callback`;

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: buildRedirectHtml('Instagram token exchange failed.'),
      };
    }

    const accountId = tokenData.user_id || tokenData.user_id?.toString() || 'instagram-account';

    await upsertInstagramOAuthToken({
      id: `instagram-oauth-${Date.now().toString(36)}`,
      accountId,
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type || 'Bearer',
      scope: Array.isArray(tokenData.scope) ? tokenData.scope.join(',') : tokenData.scope || null,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null,
      refreshToken: tokenData.refresh_token || null,
    });

    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: buildRedirectHtml('Instagram account connected successfully.', '/admin/instagram/'),
    };
  } catch (error) {
    console.error('Instagram OAuth callback failed', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: buildRedirectHtml('Instagram OAuth callback failed.'),
    };
  }
}
