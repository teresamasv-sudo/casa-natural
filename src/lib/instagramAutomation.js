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
      recipient_id: recipientId,
      message: { text },
    });
    console.info('Instagram DM send', { recipientId });
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
  const externalEventId = payload?.entry?.[0]?.id || `event-${Date.now()}`;
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

async function processCommentWebhook(payload, context = {}) {
  await initializeDatabase();
  const campaigns = await listCampaigns();
  const commentEvent = payload?.entry?.[0]?.changes?.find((change) => change.field === 'comments')?.value;
  if (!commentEvent) {
    return null;
  }

  const commentId = commentEvent.id;
  const existingInteraction = await findInteractionByCommentId(commentId);
  if (existingInteraction) {
    console.info('Instagram comment duplicate ignored', { commentId });
    return existingInteraction;
  }

  const campaign = campaigns.find((item) => item.active && campaignMatchesComment(item, commentEvent.text || ''));
  if (!campaign) {
    return null;
  }

  const interaction = {
    id: buildId('interaction'),
    campaignId: campaign.id,
    instagramCommentId: commentId,
    instagramMediaId: payload?.entry?.[0]?.changes?.find((change) => change.field === 'comments')?.value?.media_id || campaign.instagramMediaId,
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

  try {
    await createInteractionDb(interaction);
  } catch (error) {
    if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
      console.info('Instagram comment duplicate ignored', { commentId });
      return { id: commentId, duplicate: true };
    }
    throw error;
  }

  const starterMessage = buildMessageText(campaign.starterMessage, { resource_url: campaign.resourceUrl });

  try {
    await sendMetaMessage({
      recipientId: commentId,
      text: starterMessage,
      accessToken: context.accessToken || process.env.META_ACCESS_TOKEN,
      mode: 'private_reply',
    });
    interaction.status = 'PRIVATE_REPLY_SENT';
    interaction.privateReplySentAt = new Date().toISOString();
    interaction.updatedAt = new Date().toISOString();
    await updateInteractionDb(interaction);

    if (campaign.requireFollowFlow) {
      const followRequest = buildMessageText(campaign.followRequestMessage, { resource_url: campaign.resourceUrl });
      await sendMetaMessage({
        recipientId: commentId,
        text: followRequest,
        accessToken: context.accessToken || process.env.META_ACCESS_TOKEN,
        mode: 'private_reply',
      });
      interaction.status = 'WAITING_FOR_FOLLOW_CONFIRMATION';
      interaction.followStatus = 'UNAVAILABLE';
      interaction.updatedAt = new Date().toISOString();
      await updateInteractionDb(interaction);
    }
  } catch (error) {
    interaction.status = 'FAILED';
    interaction.updatedAt = new Date().toISOString();
    await updateInteractionDb(interaction);
    throw error;
  }

  return interaction;
}

async function processMessageWebhook(payload, context = {}) {
  await initializeDatabase();
  const messaging = payload?.entry?.[0]?.messaging?.[0];
  if (!messaging?.message?.text) {
    return null;
  }

  const senderId = messaging.sender?.id;
  const text = messaging.message.text;
  const interactions = await listInteractionsDb();
  const interaction = interactions
    .slice()
    .reverse()
    .find((item) => item.instagramUserId === senderId && item.status === 'WAITING_FOR_FOLLOW_CONFIRMATION');

  if (!interaction) {
    return null;
  }

  const campaign = await getCampaignByIdDb(interaction.campaignId);
  if (!campaign) {
    return null;
  }

  const isConfirmation = normalizeText(text) === normalizeText(campaign.confirmationText);
  if (!isConfirmation) {
    return interaction;
  }

  try {
    const deliveryMessage = buildMessageText(campaign.deliveryMessage, { resource_url: campaign.resourceUrl });
    await sendMetaMessage({
      recipientId: senderId,
      text: deliveryMessage,
      accessToken: context.accessToken || process.env.META_ACCESS_TOKEN,
      pageId: context.pageId || process.env.META_PAGE_ID || 'me',
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

  return interaction;
}

async function processWebhook(payload, context = {}) {
  const eventType = payload?.object || 'unknown';
  const webhookEvent = await createWebhookEvent(eventType, payload, 'PROCESSING');

  try {
    if (payload?.object === 'instagram') {
      const commentResult = await processCommentWebhook(payload, context);
      if (commentResult) {
        await markWebhookEventProcessed(webhookEvent.id, 'COMMENT_MATCHED');
      }
    }

    if (payload?.object === 'page') {
      const messageResult = await processMessageWebhook(payload, context);
      if (messageResult) {
        await markWebhookEventProcessed(webhookEvent.id, 'RESOURCE_DELIVERED');
      }
    }
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
