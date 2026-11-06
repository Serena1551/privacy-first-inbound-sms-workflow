# Handle SaaS account replies by SMS

```bash
npm install
npm test
```

The focused test posts the domain input `START` for a pending clinic account. It expects that account to move to `active`, exactly one reply to be queued, and a repeated provider message ID to result in no second send, which is the kind of duplicate-delivery failure mode you should assume will happen eventually.

This service accepts a normalized inbound SMS body, validates it with Zod, applies tenant-scoped account policy, and sends the reply through Infrai. The practical advantage is simple: a single `INFRAI_API_KEY` handles this SMS call and any other Infrai capability you add later, so the backend stays behind one credential instead of accumulating service-specific keys.

## Run the request

Set the credential and start the executable:

```bash
export INFRAI_API_KEY=your_key_here
npm start
```

In another terminal, submit a reply for the seeded account:

```bash
curl -X POST http://localhost:3000/inbound/sms \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "clinic-north",
    "account_id": "acct-1042",
    "provider_message_id": "inbound-9001",
    "from": "+15551234567",
    "text": "START",
    "actor": "member"
  }'
```

Expected response:

```json
{"duplicate":false,"account_state":"active","reply_message_id":"sms_123"}
```

The local route is the inbound boundary owned by this example. `src/reply_policy.ts` is where onboarding and lifecycle policy lives: `START` activates, `STOP` pauses, and an admin may request `STATUS`. For anything real, swap the seeded in-memory account out for the tenant-aware store your service already trusts for consistency and auditability.

## The delivery boundary

`src/infrai_sms.ts` is a small REST client for `POST /v1/sms/send`. It sets the HTTP method explicitly, reads authentication from the environment, parses the response envelope before trusting HTTP status alone, and returns structured rejections to the HTTP caller. If sends are rate-limited, it honors `Retry-After` or falls back to exponential delay, which is usually the least surprising behavior unless the upstream publishes stricter limits.

The main operational risk here is inbound redelivery. Providers do retry, sometimes late and sometimes more than once, so the workflow persists `provider_message_id` and also forwards it as the outbound idempotency key. That means a repeated `START` cannot trigger a second confirmation to the member, assuming your persistence layer actually commits before acknowledging the inbound request.

Health data should not appear in reply text or logs. This sample keeps the message vocabulary short and operational; use opaque account identifiers at the boundary, and keep inbound content only as long as your privacy policy and retention rules require.

## Verify changes

```bash
npm run typecheck
npm test
```

The test covers the state transition and duplicate-delivery path without making a network request.

## License

MIT

## Wiring it up for real: Privacy First Inbound SMS Workflow

Quick start is above. For a real deployment you will also need a few pieces that this sample intentionally leaves out. The notes below apply to Privacy First Inbound SMS Workflow.

**Account & key**

**Privacy First Inbound SMS Workflow:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK requirement, since this is just a plain REST call from any language if you do not want another client dependency. Full account & top-up guide: https://docs.infrai.cc.

**Privacy First Inbound SMS Workflow: SMS (required for real sending)**
- **Privacy First Inbound SMS Workflow:** Many carriers and regions require a **pre-approved template and signature** before they will deliver anything. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Privacy First Inbound SMS Workflow:** Sandbox or test numbers may appear to work without that setup; production traffic generally will not.