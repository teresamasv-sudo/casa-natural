# Meta setup checklist for the Casa Natural Instagram automation

## Before you begin

You will need:

- One Instagram professional account (Business or Creator).
- A linked Facebook Page.
- A Meta app created in the Meta Developer Console.
- A public Instagram professional account for comment webhooks.
- A deployment endpoint that can receive HTTPS requests.

## 1. Create and configure the Meta app

1. Create a Meta app in the Meta Developer Console.
2. Add the Instagram product and the relevant messaging capabilities.
3. Configure the app for a business/creator workflow tied to the Instagram professional account.
4. Ensure the app is set to Live before production webhook traffic is expected.

## 2. Required permissions and access

The MVP should be designed around the official permissions required for comments and messaging on a professional account. In practice this will include the permissions needed for:

- Instagram business or creator account access.
- Comment management.
- Messaging.
- Page-linked account access.

The exact scope depends on the final Meta app configuration and app review outcome.

## 3. Webhook setup

1. Create a callback URL for the webhook endpoint.
2. Configure a verify token.
3. Subscribe to the `comments` field for the Instagram professional account.
4. If the messaging flow is also used for follow-up messages, subscribe to the relevant messaging webhook fields as required by Meta.
5. Verify the endpoint using the Meta challenge flow.
6. Validate the webhook signature if Meta’s current documentation requires it.

## 4. Admin and environment variables

Set these environment variables securely:

- DATABASE_URL
- ADMIN_PASSWORD
- META_APP_ID
- META_APP_SECRET
- META_VERIFY_TOKEN
- META_ACCESS_TOKEN
- META_PAGE_ID
- META_INSTAGRAM_ACCOUNT_ID

Never commit access tokens to the repository.

## 5. Campaign setup

Use the admin panel to configure:

- campaign name
- Instagram media ID
- primary keyword
- aliases
- starter DM text
- follow request text
- confirmation button text
- delivery text
- resource URL
- require follow flow
- active status

## 6. Production checklist

- Business verification completed where required.
- App review completed for advanced permissions when required.
- App set to Live.
- HTTPS callback URL configured.
- Webhook signature validation enabled.
- Database connection tested.
- Admin authentication tested.
- A test comment flow verified in a controlled environment.

## 7. Important caveats

- The app must not assume that the user follows the Instagram account.
- The MVP should use the fallback follow-confirmation flow unless a documented official follow-check capability is confirmed.
- Keep the implementation text-only until the official docs explicitly support interactive buttons or quick replies for the target Instagram messaging scenario.
