# Meta capabilities for the Casa Natural Instagram automation

This document summarizes the current official Meta capabilities relevant to the MVP described for Casa Natural.

## Summary

The official Instagram Platform and Instagram Messaging API support the core webhook and private-reply workflow for a professional Instagram account, but the experience is constrained by Meta policy and app review requirements. The most important limitation for this MVP is that a reliable official follower-check capability is not documented for this use case, so the implementation should not assume follow status is known.

## Capability matrix

| Feature | Official API support | Official endpoint or mechanism | Required permissions | Limitations | Implementation decision |
| --- | --- | --- | --- | --- | --- |
| Receive Instagram comment webhooks | YES | Instagram webhooks with the `comments` field | Advanced access for comments; app must be live; professional account must be public | Requires app review/business verification for advanced access; comment notifications are tied to the professional account and public visibility | Use Meta webhooks as the entry point for comment events. |
| Identify the Instagram media ID from a comment event | YES | The webhook payload and Graph API object IDs | Same as above | The payload structure depends on the subscription and event contents; the implementation will use the webhook payload directly rather than infer values | Parse the official event payload and persist the media ID from the event object. |
| Read comment text from a comment event | YES | Instagram webhook comment event payload / Graph API comment object | Same as above | The payload must be stored and processed carefully; webhook delivery can be retried | Store the comment text and normalize it for matching. |
| Send a private reply to the commenter | YES | Instagram Messaging API / private reply flow for the professional account | Instagram professional account linked to a Facebook Page; messaging permissions and app review as required by Meta | The reply is subject to the current Instagram messaging policy and the permitted conversation window | Use the official messaging API for a plain-text private reply as the first step. |
| Continue the conversation after user interaction | CONDITIONAL | Instagram Messaging API, subject to the current permitted messaging window and policy | Messaging permissions and app review as required | Messages can only be sent within the current allowed conversation window; the app must not assume access outside that window | Build a state machine and only send follow-up messages when the current Meta policy allows it. |
| Use buttons / quick replies / postbacks | CONDITIONAL | Official Instagram Messaging API, if explicitly supported by the current Meta docs for the target app/account | Messaging permissions and account/app review | Do not assume support for interactive elements unless the current official Meta docs for Instagram Messaging explicitly list them for this use case | Keep the MVP text-only and add interactive elements only if the official docs explicitly support them. |
| Obtain an Instagram-scoped user ID | CONDITIONAL | Meta webhook payloads and Graph API user/profile endpoints | Messaging permissions and/or comments permissions depending on the endpoint | The availability and shape of the ID depend on the event type and the current official API surface | Persist the ID when the official event or API provides it; otherwise store the interaction without a user ID. |
| Check whether the user follows the professional account | NO / UNAVAILABLE for this MVP | No reliable official follower relationship endpoint was identified in the docs reviewed for this use case | N/A | The official docs reviewed do not provide a dependable Instagram follower check for this automation use case | Treat follower verification as unavailable and use the fallback follow-confirmation flow. |
| Respect messaging window limitations | YES | Meta policy and the Instagram Messaging API | Messaging permissions | The window is not controlled by the app and can vary by user and policy | Use the state machine to stop if the conversation is no longer allowed. |
| Handle rate limits and retries | YES | Graph API and webhook delivery behavior | N/A | Webhook retries and API throttling must be handled gracefully | Use idempotency and retry-safe processing. |
| App review / business verification | YES | Meta App Dashboard and Business Verification | Business verification and app review as required | The app must be reviewed for advanced access and messaging features when required | Plan for business verification and app review before production. |

## Notes

- The current official Meta documentation supports receiving comments and sending messages from a professional account, but the workflow must be implemented conservatively.
- The MVP should avoid any assumption that the user follows the account.
- The implementation should never scrape Instagram, use unofficial APIs, or browser automation.
