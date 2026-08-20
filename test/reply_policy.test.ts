import assert from "node:assert/strict";
import test from "node:test";
import { InboundSmsWorkflow, InMemoryAccountStore } from "../src/inbound_sms_service.ts";

test("START activates a pending tenant account and duplicate delivery sends once", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ tenantId: "clinic-north", accountId: "acct-1042", phone: "+15551234567", state: "pending" });
  const sent: string[] = [];
  const workflow = new InboundSmsWorkflow(store, async (_to, message) => {
    sent.push(message);
    return { message_id: "sms-reply-1" };
  });
  const inbound = {
    tenant_id: "clinic-north",
    account_id: "acct-1042",
    provider_message_id: "inbound-9001",
    from: "+15551234567",
    text: "START",
    actor: "member" as const,
  };

  const first = await workflow.handle(inbound);
  const duplicate = await workflow.handle(inbound);

  assert.deepEqual(first, { duplicate: false, account_state: "active", reply_message_id: "sms-reply-1" });
  assert.deepEqual(duplicate, { duplicate: true, account_state: "active" });
  assert.deepEqual(sent, ["Account notifications are active."]);
});
