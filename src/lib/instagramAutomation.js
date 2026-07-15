import { createHash } from 'node:crypto';
import {
  createInteraction as createInteractionDb,
  createOrUpdateCampaign as createOrUpdateCampaignDb,
  createWebhookEvent as createWebhookEventDb,
  getCampaignById as getCampaignByIdDb,
  getInteractionByCommentId as getInteractionByCommentIdDb,
  getWebhookEventByExternalId as getWebhookEventByExternalIdDb,
  initializeDatabase,
  listCampaigns as listCampaignsDb,
  listInteractions as listInteractionsDb,
  listWebhookEvents as listWebhookEventsDb,
  markWebhookEventProcessed as markWebhookEventProcessedDb,
  seedDefaultCampaign,
  updateInteraction as updateInteractionDb,
} from './postgresStore.js';

function normalizeText(value) {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function buildId(prefix) {
  return `${prefix}-${createHash('sha1').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 12)}`;
}

function normalizeCampaignRow(row) {
  if (!row) {
    return null;
  }

  const keywordAliases = Array.isArray(row.keyword_aliases)
    ? row.keyword_aliases
    : (typeof row.keywordAliases === 'string' ? row.keywordAliases.split(',').map((value) => value.trim()).filter(Boolean) : []);

  return {
    ...row,
    id: row.id,
    name: row.name,
    instagramMediaId: row.instagram_media_id ?? row.instagramMediaId,
    primaryKeyword: row.primary_keyword ?? row.primaryKeyword,
    keywordAliases,
    starterMessage: row.starter_message ?? row.starterMessage,
    followRequestMessage: row.follow_request_message ?? row.followRequestMessage,
    confirmationText: row.confirmation_text ?? row.confirmationText,
    deliveryMessage: row.delivery_message ?? row.deliveryMessage,
    resourceUrl: row.resource_url ?? row.resourceUrl,
    requireFollowFlow: row.require_follow_flow ?? row.requireFollowFlow ?? false,
    active: row.active,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function normalizeInteractionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: row.id,
    campaignId: row.campaign_id ?? row.campaignId,
    instagramCommentId: row.instagram_comment_id ?? row.instagramCommentId,
    instagramMediaId: row.instagram_media_id ?? row.instagramMediaId,
    instagramUserId: row.instagram_user_id ?? row.instagramUserId,
    originalCommentText: row.original_comment_text ?? row.originalCommentText,
    normalizedCommentText: row.normalized_comment_text ?? row.normalizedCommentText,
    privateReplySentAt: row.private_reply_sent_at ?? row.privateReplySentAt,
    userInteractedAt: row.user_interacted_at ?? row.userInteractedAt,
    followStatus: row.follow_status ?? row.followStatus,
    resourceDeliveredAt: row.resource_delivered_at ?? row.resourceDeliveredAt,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function normalizeWebhookEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: row.id,
    externalEventId: row.external_event_id ?? row.externalEventId,
    eventType: row.event_type ?? row.eventType,
    payload: row.payload,
    processedAt: row.processed_at ?? row.processedAt,
    processingStatus: row.processing_status ?? row.processingStatus,
    createdAt: row.created_at ?? row.createdAt,
  };
}

async function loadStore() {
  await initializeDatabase();
  await seedDefaultCampaign();
  const campaigns = await listCampaignsDb();
  const interactions = await listInteractionsDb();
  const webhookEvents = await listWebhookEventsDb();
  return {
    campaigns: (campaigns || []).map(normalizeCampaignRow).filter(Boolean),
    interactions: (interactions || []).map(normalizeInteractionRow).filter(Boolean),
    webhookEvents: (webhookEvents || []).map(normalizeWebhookEventRow).filter(Boolean),
  };
}

function getCampaignKeywords(campaign) {
  const keywords = [campaign.primaryKeyword, ...(campaign.keywordAliases || [])]
    .filter(Boolean)
    .map((value) => normalizeText(value));

  return keywords.filter(Boolean);
}

function campaignMatchesComment(campaign, commentText) {
  const normalizedComment = normalizeText(commentText);
  if (!normalizedComment) {
    return false;
  }

  const keywords = getCampaignKeywords(campaign);
  return keywords.some((keyword) => normalizedComment.includes(keyword));
}

function buildMessageText(template, values = {}) {
  return (template || '').replace(/\{\{(.*?)\}\}/g, (_, key) => values[key.trim()] ?? '');
}

function createFollowerVerificationProvider() {
  return {
    async getFollowerStatus() {
      return 'UNAVAILABLE';
    },
  };
}

async function sendMetaMessage({ recipientId, text, accessToken, mode = 'dm' }) {
  if (!accessToken) {
    throw new Error('META_ACCESS_TOKEN is not configured');
  }

  if (!recipientId) {
    throw new Error('Recipient ID is required');
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  let endpoint;
  let body;

  if (mode === 'private_reply') {
    endpoint = 'https://graph.instagram.com/v22.0/me/messages';
    body = JSON.stringify({
      recipient: { comment_id: recipientId },
      message: { text },
    });
    console.info('Instagram private reply', { recipientId });
  } else {
    endpoint = 'https://graph.instagram.com/v22.0/me/messages';
    body = JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    });
    console.info('Instagram DM send');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Instagram message delivery failed', {
      mode,
      status: response.status,
      error: payload.error || payload,
    });
    throw new Error(payload.error?.message || 'Instagram message delivery failed');
  }

  return payload;
}

async function listCampaigns() {
  await initializeDatabase();
  await seedDefaultCampaign();
  const campaigns = await listCampaignsDb();
  return (campaigns || []).map(normalizeCampaignRow).filter(Boolean);
}

async function getCampaignById(campaignId) {
  await initializeDatabase();
  const campaign = await getCampaignByIdDb(campaignId);
  return normalizeCampaignRow(campaign);
}

async function createOrUpdateCampaign(payload) {
  await initializeDatabase();
  const now = new Date().toISOString();
  const normalizedPayload = {
    ...payload,
    keywordAliases: (payload.keywordAliases || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    requireFollowFlow: payload.requireFollowFlow === 'true' || payload.requireFollowFlow === true,
    active: payload.active === 'true' || payload.active === true,
  };

  if (!normalizedPayload.id) {
    normalizedPayload.id = buildId('campaign');
  }

  const savedCampaign = await createOrUpdateCampaignDb(normalizedPayload);
  const normalizedCampaign = normalizeCampaignRow(savedCampaign);
  return normalizedCampaign;
}

async function findInteractionByCommentId(commentId) {
  await initializeDatabase();
  const interaction = await getInteractionByCommentIdDb(commentId);
  return normalizeInteractionRow(interaction);
}

async function findInteractionsByUserId(userId) {
  await initializeDatabase();
  const interactions = await listInteractionsDb();
  return (interactions || []).map(normalizeInteractionRow).filter(Boolean);
}

async function createWebhookEvent(eventType, payload, processingStatus = 'RECEIVED') {
  await initializeDatabase();
  // entry[0].id is the Instagram account ID (identical on every event), so the
  // idempotency key must come from the payload itself: identical retried
  // deliveries collapse into one row, distinct events never collide.
  const externalEventId = `event-${createHash('sha1').update(JSON.stringify(payload || {})).digest('hex')}`;
  const existing = await getWebhookEventByExternalIdDb(externalEventId);
  if (existing) {
    return normalizeWebhookEventRow(existing);
  }

  const eventId = buildId('webhook');
  const webhookEvent = {
    id: eventId,
    externalEventId,
    eventType,
    payload,
    processingStatus,
    createdAt: new Date().toISOString(),
  };

  const created = await createWebhookEventDb(webhookEvent);
  return normalizeWebhookEventRow(created) || webhookEvent;
}

async function markWebhookEventProcessed(eventId, processingStatus) {
  await initializeDatabase();
  const updated = await markWebhookEventProcessedDb(eventId, processingStatus);
  return normalizeWebhookEventRow(updated);
}

function extractCommentChanges(payload) {
  const commentChanges = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === 'comments' && change.value) {
        commentChanges.push({
          entryId: entry.id != null ? String(entry.id) : null,
          value: change.value,
        });
      }
    }
  }
  return commentChanges;
}

// Instagram only accepts a private reply for a top-level comment on our own
// media, written by someone other than the account itself, that has not been
// private-replied before. Anything else is rejected with code 100 /
// subcode 2534025 ("The comment is invalid for a private reply").
function evaluateCommentEligibility({ entryId, value }) {
  if (!value.id) {
    return { eligible: false, reason: 'missing_comment_id' };
  }

  if (value.parent_id) {
    return { eligible: false, reason: 'reply_comment' };
  }

  const fromId = value.from?.id != null ? String(value.from.id) : null;
  if (fromId && entryId && fromId === entryId) {
    return { eligible: false, reason: 'own_comment' };
  }

  return { eligible: true, reason: 'top_level_comment' };
}

async function processCommentWebhook(payload, context = {}) {
  await initializeDatabase();
  const commentChanges = extractCommentChanges(payload);
  if (commentChanges.length === 0) {
    return null;
  }

  const campaigns = await listCampaigns();
  let lastResult = null;

  for (const commentChange of commentChanges) {
    const commentEvent = commentChange.value;
    const commentId = commentEvent.id || null;
    const mediaId = commentEvent.media?.id || commentEvent.media_id || null;
    const eligibility = evaluateCommentEligibility(commentChange);

    console.info('Instagram comment event', {
      field: 'comments',
      commentId,
      mediaId,
      parentId: commentEvent.parent_id || null,
      topLevel: !commentEvent.parent_id,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    });

    if (!eligibility.eligible) {
      continue;
    }

    const existingInteraction = await findInteractionByCommentId(commentId);
    if (existingInteraction) {
      console.info('Instagram comment duplicate ignored', { commentId });
      lastResult = existingInteraction;
      continue;
    }

    const campaign = campaigns.find((item) => item.active && campaignMatchesComment(item, commentEvent.text || ''));
    if (!campaign) {
      console.info('Instagram comment did not match any campaign', { commentId });
      continue;
    }

    const interaction = {
      id: buildId('interaction'),
      campaignId: campaign.id,
      instagramCommentId: commentId,
      instagramMediaId: mediaId,
      instagramUserId: commentEvent.from?.id || null,
      originalCommentText: commentEvent.text || '',
      normalizedCommentText: normalizeText(commentEvent.text || ''),
      status: 'COMMENT_MATCHED',
      privateReplySentAt: null,
      userInteractedAt: null,
      followStatus: 'UNAVAILABLE',
      resourceDeliveredAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Atomic claim: the UNIQUE constraint on instagram_comment_id makes the
    // INSERT the deduplication point, before any send is attempted.
    try {
      await createInteractionDb(interaction);
      console.info('Instagram comment claimed', { commentId });
    } catch (error) {
      if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
        console.info('Instagram comment duplicate ignored', { commentId });
        lastResult = { id: commentId, duplicate: true };
        continue;
      }
      throw error;
    }

    const starterMessage = buildMessageText(campaign.starterMessage, { resource_url: campaign.resourceUrl });

    // Instagram allows exactly ONE private reply per comment, so only the
    // starter message goes out here. When the campaign requires the follow
    // flow, the follow-request is sent later as a DM, once the user has
    // messaged us and a messaging window exists (see processMessageWebhook).
    try {
      await sendMetaMessage({
        recipientId: commentId,
        text: starterMessage,
        accessToken: context.accessToken || process.env.META_ACCESS_TOKEN,
        mode: 'private_reply',
      });
      interaction.status = campaign.requireFollowFlow ? 'WAITING_FOR_FOLLOW_CONFIRMATION' : 'PRIVATE_REPLY_SENT';
      interaction.privateReplySentAt = new Date().toISOString();
      interaction.updatedAt = new Date().toISOString();
      await updateInteractionDb(interaction);
    } catch (error) {
      interaction.status = 'FAILED';
      interaction.updatedAt = new Date().toISOString();
      await updateInteractionDb(interaction);
      throw error;
    }

    lastResult = interaction;
  }

  return lastResult;
}

async function processMessageWebhook(payload, context = {}) {
  await initializeDatabase();
  const messagingEvents = [];
  for (const entry of payload?.entry || []) {
    for (const messaging of entry.messaging || []) {
      messagingEvents.push(messaging);
    }
  }

  if (messagingEvents.length === 0) {
    return null;
  }

  let lastResult = null;

  for (const messaging of messagingEvents) {
    // Echoes are our own outbound messages delivered back to the webhook;
    // reacting to them would loop the automation against itself.
    if (!messaging?.message?.text || messaging.message.is_echo) {
      continue;
    }

    const senderId = messaging.sender?.id;
    if (!senderId) {
      continue;
    }

    const text = messaging.message.text;
    const rows = await listInteractionsDb();
    const interaction = rows
      .map(normalizeInteractionRow)
      .filter(Boolean)
      .reverse()
      .find((item) => item.instagramUserId === String(senderId) && item.status === 'WAITING_FOR_FOLLOW_CONFIRMATION');

    if (!interaction) {
      continue;
    }

    const campaign = normalizeCampaignRow(await getCampaignByIdDb(interaction.campaignId));
    if (!campaign) {
      continue;
    }

    const isConfirmation = normalizeText(text) === normalizeText(campaign.confirmationText);

    if (!isConfirmation) {
      // First user message opens the messaging window: send the follow-request
      // exactly once (followStatus guards repeats on later messages).
      if (interaction.followStatus !== 'REQUESTED' && campaign.followRequestMessage) {
        const followRequest = buildMessageText(campaign.followRequestMessage, { resource_url: campaign.resourceUrl });
        await sendMetaMessage({
          recipientId: senderId,
          text: followRequest,
          accessToken: context.accessToken || process.env.META_ACCESS_TOKEN,
          mode: 'dm',
        });
        interaction.followStatus = 'REQUESTED';
        interaction.userInteractedAt = new Date().toISOString();
        interaction.updatedAt = new Date().toISOString();
        await updateInteractionDb(interaction);
      }
      lastResult = interaction;
      continue;
    }

    try {
      const deliveryMessage = buildMessageText(campaign.deliveryMessage, { resource_url: campaign.resourceUrl });
      await sendMetaMessage({
        recipientId: senderId,
        text: deliveryMessage,
        accessToken: context.accessToken || process.env.META_ACCESS_TOKEN,
        mode: 'dm',
      });

      interaction.status = 'RESOURCE_DELIVERED';
      interaction.resourceDeliveredAt = new Date().toISOString();
      interaction.userInteractedAt = new Date().toISOString();
      interaction.updatedAt = new Date().toISOString();
      await updateInteractionDb(interaction);
    } catch (error) {
      interaction.status = 'FAILED';
      interaction.updatedAt = new Date().toISOString();
      await updateInteractionDb(interaction);
      throw error;
    }

    lastResult = interaction;
  }

  return lastResult;
}

async function processWebhook(payload, context = {}) {
  const eventType = payload?.object || 'unknown';
  const webhookEvent = await createWebhookEvent(eventType, payload, 'PROCESSING');

  try {
    let status = 'SKIPPED';

    // Instagram Login delivers both comment changes and messaging events
    // under object "instagram"; the legacy "page" object only ever carried
    // messaging events.
    if (payload?.object === 'instagram') {
      const commentResult = await processCommentWebhook(payload, context);
      if (commentResult) {
        status = 'COMMENT_MATCHED';
      }

      const messageResult = await processMessageWebhook(payload, context);
      if (messageResult) {
        status = 'MESSAGE_PROCESSED';
      }
    } else if (payload?.object === 'page') {
      const messageResult = await processMessageWebhook(payload, context);
      if (messageResult) {
        status = 'MESSAGE_PROCESSED';
      }
    }

    await markWebhookEventProcessed(webhookEvent.id, status);
  } catch (error) {
    await markWebhookEventProcessed(webhookEvent.id, 'FAILED');
    throw error;
  }

  return webhookEvent;
}

export {
  createFollowerVerificationProvider,
  createOrUpdateCampaign,
  getCampaignById,
  listCampaigns,
  loadStore,
  processCommentWebhook,
  processMessageWebhook,
  processWebhook,
  normalizeText,
  sendMetaMessage,
};
