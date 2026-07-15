# Architecture recommendation for the Casa Natural Instagram automation

## Decision

The automation should live inside the existing Astro repository as isolated server/API functionality rather than as a separate app.

Why this is the best fit:

- The repository already uses Astro and Netlify Functions, so the webhook endpoint can be added without disrupting the public website.
- The internal admin panel can be added as a protected route or server-side page without creating a separate frontend app.
- The project is intentionally small and internal, so a single deployment footprint is simpler and safer than introducing a second application.

## Recommended architecture

- Runtime: Node.js with TypeScript.
- Webhook entrypoint: Netlify Function (for the Instagram callback endpoint).
- Admin panel: protected Astro route or simple server-rendered page inside the same app.
- Database: PostgreSQL via a minimal managed service such as Neon or Supabase Postgres.
- Meta API client: official Meta Graph API client calls from the server function.
- Logging and observability: structured logs to the hosting provider and a small audit table in the database.

## Event flow

1. Instagram sends a comment webhook to the callback endpoint.
2. The server verifies the Meta webhook signature and challenge where applicable.
3. The payload is stored in the database as a raw webhook event.
4. The system deduplicates by Instagram comment ID and event idempotency key.
5. If the comment matches an active campaign keyword, the system creates or updates an interaction record.
6. The system sends one official private reply using the Instagram Messaging API.
7. If the interaction is allowed and the follow requirement is enabled, the system uses the follower capability abstraction.
8. If follower verification is unavailable, the system sends the fallback follow-confirmation flow.
9. When the user confirms, the configured resource URL is delivered.

## Database model

### Campaign

- id
- name
- instagramMediaId
- primaryKeyword
- keywordAliases
- starterMessage
- followRequestMessage
- confirmationText
- deliveryMessage
- resourceUrl
- requireFollowFlow
- active
- createdAt
- updatedAt

### InstagramInteraction

- id
- campaignId
- instagramCommentId (unique)
- instagramMediaId
- instagramUserId or scoped ID if officially available
- originalCommentText
- normalizedCommentText
- status
- privateReplySentAt
- userInteractedAt
- followStatus
- resourceDeliveredAt
- createdAt
- updatedAt

### WebhookEvent

- id
- externalEventId or deterministic idempotency key
- eventType
- payload
- processedAt
- processingStatus
- createdAt

## State machine

The interaction state machine should be explicit and observable:

- COMMENT_MATCHED
- PRIVATE_REPLY_SENT
- WAITING_FOR_INTERACTION
- WAITING_FOR_FOLLOW_CONFIRMATION
- RESOURCE_DELIVERED
- FAILED

This keeps the automation idempotent and easier to reason about when Meta retries webhooks or the user interacts later.

## Idempotency strategy

- Use the Instagram comment ID as the primary deduplication key.
- Store a deterministic webhook event idempotency key derived from the event payload where possible.
- Never process the same comment twice.
- Ensure repeated webhook deliveries do not create duplicate interactions or duplicate replies.

## Security decisions

- Store all secrets in environment variables.
- Never log access tokens, Meta secrets, or sensitive webhook payloads beyond what is necessary for debugging.
- Validate Meta webhook verification requests correctly.
- Validate webhook signatures when supported by the current Meta docs.
- Protect the admin panel with simple password authentication.
- Keep the admin interface internal and avoid exposing Instagram identifiers in the public UI.
- Apply rate limiting on the webhook endpoint and admin endpoints.

## Deployment recommendation

Recommended deployment for the MVP:

- Netlify for the Astro site and serverless functions.
- Neon or Supabase Postgres for the relational database.

This keeps the number of services low and fits the existing repository well.

## Estimated recurring cost at low Casa Natural volume

- Netlify: likely free or low-cost for a small internal deployment.
- Postgres: low-cost starter tier or free tier.
- Meta app: no direct usage fee, but app review and business verification are required.

For low-volume use, the recurring cost should stay very low.

## Known limitations

- The automation depends on Meta app review and business verification for advanced Instagram features.
- Comment webhooks require the professional account to be public and the app to be live.
- Follower verification is not treated as available in the MVP because the official docs do not provide a dependable path for it.
- The messaging window is policy-controlled and cannot be assumed to remain open indefinitely.
