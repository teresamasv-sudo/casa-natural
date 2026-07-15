import { createOrUpdateCampaign, listCampaigns, loadStore } from '../../src/lib/instagramAutomation.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function unauthorized() {
  return {
    statusCode: 401,
    body: JSON.stringify({ error: 'Acceso no autorizado' }),
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const password = body.password || '';
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return unauthorized();
    }

    if (body.action === 'authenticate') {
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    if (body.action === 'listCampaigns') {
      const campaigns = await listCampaigns();
      const store = await loadStore();
      const metrics = campaigns.map((campaign) => {
        const interactions = (store.interactions || []).filter((interaction) => interaction.campaignId === campaign.id);
        return {
          ...campaign,
          metrics: {
            matching: interactions.length,
            replies: interactions.filter((interaction) => interaction.privateReplySentAt).length,
            deliveries: interactions.filter((interaction) => interaction.resourceDeliveredAt).length,
          },
        };
      });

      return { statusCode: 200, body: JSON.stringify({ campaigns: metrics }) };
    }

    if (body.action === 'saveCampaign') {
      const campaign = await createOrUpdateCampaign(body.campaign || {});
      return { statusCode: 200, body: JSON.stringify({ campaign }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Acción no soportada' }) };
  } catch (error) {
    console.error('Admin function failed', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
