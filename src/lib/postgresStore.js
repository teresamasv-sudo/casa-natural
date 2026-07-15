import { neon } from '@neondatabase/serverless';

let sql = null;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }

  return sql;
}

async function initializeDatabase() {
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instagram_media_id TEXT NOT NULL,
      primary_keyword TEXT NOT NULL,
      keyword_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
      starter_message TEXT NOT NULL,
      follow_request_message TEXT NOT NULL,
      confirmation_text TEXT NOT NULL,
      delivery_message TEXT NOT NULL,
      resource_url TEXT NOT NULL,
      require_follow_flow BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await db`
    CREATE TABLE IF NOT EXISTS instagram_interactions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      instagram_comment_id TEXT NOT NULL UNIQUE,
      instagram_media_id TEXT,
      instagram_user_id TEXT,
      original_comment_text TEXT NOT NULL,
      normalized_comment_text TEXT NOT NULL,
      status TEXT NOT NULL,
      private_reply_sent_at TIMESTAMPTZ,
      user_interacted_at TIMESTAMPTZ,
      follow_status TEXT NOT NULL DEFAULT 'UNAVAILABLE',
      resource_delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await db`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      external_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      processed_at TIMESTAMPTZ,
      processing_status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(active);
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_interactions_campaign_id ON instagram_interactions(campaign_id);
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_interactions_status ON instagram_interactions(status);
  `;

  await db`
    CREATE TABLE IF NOT EXISTS instagram_oauth_tokens (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'Bearer',
      scope TEXT,
      expires_at TIMESTAMPTZ,
      refresh_token TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

async function ensureInstagramOAuthTable() {
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS instagram_oauth_tokens (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'Bearer',
      scope TEXT,
      expires_at TIMESTAMPTZ,
      refresh_token TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

async function seedDefaultCampaign() {
  const db = getSql();
  const existing = await db`SELECT id FROM campaigns LIMIT 1`;
  if (existing.length > 0) {
    return;
  }

  await db`
    INSERT INTO campaigns (
      id,
      name,
      instagram_media_id,
      primary_keyword,
      keyword_aliases,
      starter_message,
      follow_request_message,
      confirmation_text,
      delivery_message,
      resource_url,
      require_follow_flow,
      active
    ) VALUES (
      'campaign-limoncello',
      'Limoncello',
      'configured-later',
      'LIMÓN',
      '[]'::jsonb,
      '🍋 La tengo.\n\nPulsa aquí y te mando la receta del limoncello.',
      'Un momento 🌿 Creo que todavía no estás dentro de Casa Natural.\n\nSígueme y escribe YA ESTÁ 🍋. Te guardo el limoncello 🍋',
      'YA ESTÁ 🍋',
      'Ahora sí 🍋\n\nAquí tienes la receta del limoncello de Casa Natural.\n\n{{resource_url}}\n\nGuárdala, que esto en verano desaparece misteriosamente del congelador.',
      'https://casanatural.com/recetas/limoncello',
      TRUE,
      TRUE
    );
  `;
}

async function listCampaigns() {
  const db = getSql();
  return db`SELECT * FROM campaigns ORDER BY created_at ASC`;
}

async function getCampaignById(campaignId) {
  const db = getSql();
  const rows = await db`SELECT * FROM campaigns WHERE id = ${campaignId}`;
  return rows[0] || null;
}

async function createOrUpdateCampaign(payload) {
  const db = getSql();
  const now = new Date().toISOString();
  const aliases = (payload.keywordAliases || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const normalizedPayload = {
    ...payload,
    keywordAliases: aliases,
    requireFollowFlow: payload.requireFollowFlow === 'true' || payload.requireFollowFlow === true,
    active: payload.active === 'true' || payload.active === true,
  };

  if (normalizedPayload.id) {
    const rows = await db`
      UPDATE campaigns
      SET
        name = ${normalizedPayload.name || ''},
        instagram_media_id = ${normalizedPayload.instagramMediaId || ''},
        primary_keyword = ${normalizedPayload.primaryKeyword || ''},
        keyword_aliases = ${JSON.stringify(normalizedPayload.keywordAliases)}::jsonb,
        starter_message = ${normalizedPayload.starterMessage || ''},
        follow_request_message = ${normalizedPayload.followRequestMessage || ''},
        confirmation_text = ${normalizedPayload.confirmationText || ''},
        delivery_message = ${normalizedPayload.deliveryMessage || ''},
        resource_url = ${normalizedPayload.resourceUrl || ''},
        require_follow_flow = ${normalizedPayload.requireFollowFlow},
        active = ${normalizedPayload.active},
        updated_at = ${now}
      WHERE id = ${normalizedPayload.id}
      RETURNING *;
    `;

    return rows[0] || null;
  }

  const id = payload.id || `campaign-${Date.now().toString(36)}`;
  const rows = await db`
    INSERT INTO campaigns (
      id,
      name,
      instagram_media_id,
      primary_keyword,
      keyword_aliases,
      starter_message,
      follow_request_message,
      confirmation_text,
      delivery_message,
      resource_url,
      require_follow_flow,
      active,
      created_at,
      updated_at
    ) VALUES (
      ${id},
      ${normalizedPayload.name || ''},
      ${normalizedPayload.instagramMediaId || ''},
      ${normalizedPayload.primaryKeyword || ''},
      ${JSON.stringify(normalizedPayload.keywordAliases)}::jsonb,
      ${normalizedPayload.starterMessage || ''},
      ${normalizedPayload.followRequestMessage || ''},
      ${normalizedPayload.confirmationText || ''},
      ${normalizedPayload.deliveryMessage || ''},
      ${normalizedPayload.resourceUrl || ''},
      ${normalizedPayload.requireFollowFlow},
      ${normalizedPayload.active},
      ${now},
      ${now}
    ) RETURNING *;
  `;

  return rows[0] || null;
}

async function getInteractionByCommentId(commentId) {
  const db = getSql();
  const rows = await db`SELECT * FROM instagram_interactions WHERE instagram_comment_id = ${commentId}`;
  return rows[0] || null;
}

async function createInteraction(interaction) {
  const db = getSql();
  const rows = await db`
    INSERT INTO instagram_interactions (
      id,
      campaign_id,
      instagram_comment_id,
      instagram_media_id,
      instagram_user_id,
      original_comment_text,
      normalized_comment_text,
      status,
      private_reply_sent_at,
      user_interacted_at,
      follow_status,
      resource_delivered_at,
      created_at,
      updated_at
    ) VALUES (
      ${interaction.id},
      ${interaction.campaignId},
      ${interaction.instagramCommentId},
      ${interaction.instagramMediaId || null},
      ${interaction.instagramUserId || null},
      ${interaction.originalCommentText || ''},
      ${interaction.normalizedCommentText || ''},
      ${interaction.status},
      ${interaction.privateReplySentAt || null},
      ${interaction.userInteractedAt || null},
      ${interaction.followStatus || 'UNAVAILABLE'},
      ${interaction.resourceDeliveredAt || null},
      ${interaction.createdAt},
      ${interaction.updatedAt}
    ) RETURNING *;
  `;
  return rows[0] || null;
}

async function updateInteraction(interaction) {
  const db = getSql();
  const rows = await db`
    UPDATE instagram_interactions
    SET
      campaign_id = ${interaction.campaignId},
      instagram_media_id = ${interaction.instagramMediaId || null},
      instagram_user_id = ${interaction.instagramUserId || null},
      original_comment_text = ${interaction.originalCommentText || ''},
      normalized_comment_text = ${interaction.normalizedCommentText || ''},
      status = ${interaction.status},
      private_reply_sent_at = ${interaction.privateReplySentAt || null},
      user_interacted_at = ${interaction.userInteractedAt || null},
      follow_status = ${interaction.followStatus || 'UNAVAILABLE'},
      resource_delivered_at = ${interaction.resourceDeliveredAt || null},
      updated_at = ${interaction.updatedAt}
    WHERE id = ${interaction.id}
    RETURNING *;
  `;
  return rows[0] || null;
}

async function upsertInstagramOAuthToken(payload) {
  const db = getSql();
  const now = new Date().toISOString();
  const rows = await db`
    INSERT INTO instagram_oauth_tokens (
      id,
      account_id,
      access_token,
      token_type,
      scope,
      expires_at,
      refresh_token,
      created_at,
      updated_at
    ) VALUES (
      ${payload.id},
      ${payload.accountId},
      ${payload.accessToken},
      ${payload.tokenType || 'Bearer'},
      ${payload.scope || null},
      ${payload.expiresAt || null},
      ${payload.refreshToken || null},
      ${now},
      ${now}
    )
    ON CONFLICT (account_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      refresh_token = EXCLUDED.refresh_token,
      updated_at = EXCLUDED.updated_at
    RETURNING *;
  `;
  return rows[0] || null;
}

async function listInteractions() {
  const db = getSql();
  return db`SELECT * FROM instagram_interactions ORDER BY created_at ASC`;
}

async function listInteractionsByCampaign(campaignId) {
  const db = getSql();
  return db`SELECT * FROM instagram_interactions WHERE campaign_id = ${campaignId} ORDER BY created_at ASC`;
}

async function createWebhookEvent(event) {
  const db = getSql();
  const rows = await db`
    INSERT INTO webhook_events (
      id,
      external_event_id,
      event_type,
      payload,
      processed_at,
      processing_status,
      created_at
    ) VALUES (
      ${event.id},
      ${event.externalEventId},
      ${event.eventType},
      ${JSON.stringify(event.payload)}::jsonb,
      ${event.processedAt || null},
      ${event.processingStatus},
      ${event.createdAt}
    ) ON CONFLICT (external_event_id) DO NOTHING RETURNING *;
  `;
  return rows[0] || null;
}

async function markWebhookEventProcessed(eventId, processingStatus) {
  const db = getSql();
  const rows = await db`
    UPDATE webhook_events
    SET processed_at = ${new Date().toISOString()}, processing_status = ${processingStatus}
    WHERE id = ${eventId}
    RETURNING *;
  `;
  return rows[0] || null;
}

async function listWebhookEvents() {
  const db = getSql();
  return db`SELECT * FROM webhook_events ORDER BY created_at DESC`;
}

async function getWebhookEventByExternalId(externalId) {
  const db = getSql();
  const rows = await db`SELECT * FROM webhook_events WHERE external_event_id = ${externalId}`;
  return rows[0] || null;
}

export {
  createOrUpdateCampaign,
  createInteraction,
  createWebhookEvent,
  ensureInstagramOAuthTable,
  getCampaignById,
  getInteractionByCommentId,
  getSql,
  getWebhookEventByExternalId,
  initializeDatabase,
  listCampaigns,
  listInteractions,
  listInteractionsByCampaign,
  listWebhookEvents,
  markWebhookEventProcessed,
  seedDefaultCampaign,
  updateInteraction,
  upsertInstagramOAuthToken,
};
