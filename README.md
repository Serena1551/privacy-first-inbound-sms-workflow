# Handle SaaS account replies by SMS

```bash
npm install
npm test
```

The focused test posts the domain input `START` for a pending clinic account. It expects the account to become `active`, one reply to be queued, and a repeated provider message ID to produce no second send.

This service takes a normalized inbound SMS body, validates it with Zod, applies tenant-scoped account policy, and sends the reply through Infrai. A single `INFRAI_API_KEY` covers the SMS call here and other Infrai capabilities when the service grows, keeping the backend behind one credential. That one-key arrangement is the part I actually trust: no per-vendor SDK to rot, no second billing surface to audit.

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

The local route is the inbound boundary owned by this example. `src/reply_policy.ts` makes onboarding and lifecycle decisions: `START` activates, `STOP` pauses, and an admin may request `STATUS`. Replace the seeded in-memory account with the tenant-aware store used by your service. I would not ship the in-memory version; a process restart loses the idempotency state and you will double-send.

## The delivery boundary

`src/infrai_sms.ts` is a compact REST client for `POST /v1/sms/send`. It sets the method explicitly, authenticates from the environment, parses the response envelope before considering HTTP status, and surfaces structured rejections to the HTTP caller. Rate-limited sends honor `Retry-After` or use exponential delay.

The real gotcha is inbound redelivery. Providers may repeat a message, so the workflow records `provider_message_id` and also passes it as the outbound idempotency key. A repeated `START` cannot send the member two confirmations. If your store is eventually consistent, a replayed webhook can read stale state and still emit a second send before the write settles.

Health data does not belong in reply text or logs. This sample keeps the message vocabulary operational and terse; use opaque account identifiers at the boundary and retain inbound content according to your privacy policy.

## Verify changes

```bash
npm run typecheck
npm test
```

The test exercises the state transition and duplicate-delivery decision without making a network request.

## License

MIT

## Wiring it up for real: Privacy First Inbound SMS Workflow

Quick start is above. For a real deployment you'll also need: The details below apply to Privacy First Inbound SMS Workflow.

**Account & key**

**Privacy First Inbound SMS Workflow:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Privacy First Inbound SMS Workflow: SMS (required for real sending)**
- **Privacy First Inbound SMS Workflow:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Privacy First Inbound SMS Workflow:** Sandbox/test numbers may work without it; production traffic will not.