import { z } from "zod";
import { InfraiError, infrai } from "./infrai_sms.ts";
import { decideReply, type Account, type InboundReply } from "./reply_policy.ts";

export const inboundReplySchema = z.object({
  tenant_id: z.string().min(1),
  account_id: z.string().min(1),
  provider_message_id: z.string().min(1),
  from: z.string().regex(/^\+[1-9]\d{7,14}$/),
  text: z.string().min(1).max(160),
  actor: z.enum(["member", "admin"]),
});

type InboundBody = z.infer<typeof inboundReplySchema>;
type SmsSender = (to: string, message: string, idempotencyKey: string) => Promise<{ message_id: string }>;

export type WorkflowResult = {
  duplicate: boolean;
  account_state: Account["state"];
  reply_message_id?: string;
};

export class InMemoryAccountStore {
  private readonly accounts = new Map<string, Account>();
  private readonly handledMessages = new Set<string>();

  seed(account: Account): void {
    this.accounts.set(`${account.tenantId}:${account.accountId}`, account);
  }

  get(tenantId: string, accountId: string): Account | undefined {
    return this.accounts.get(`${tenantId}:${accountId}`);
  }

  save(account: Account): void {
    this.accounts.set(`${account.tenantId}:${account.accountId}`, account);
  }

  hasHandled(messageId: string): boolean {
    return this.handledMessages.has(messageId);
  }

  markHandled(messageId: string): void {
    this.handledMessages.add(messageId);
  }
}

export class InboundSmsWorkflow {
  private readonly store: InMemoryAccountStore;
  private readonly sendSms: SmsSender;

  constructor(store: InMemoryAccountStore, sendSms: SmsSender) {
    this.store = store;
    this.sendSms = sendSms;
  }

  async handle(body: InboundBody): Promise<WorkflowResult> {
    const inbound: InboundReply = {
      tenantId: body.tenant_id,
      accountId: body.account_id,
      providerMessageId: body.provider_message_id,
      from: body.from,
      text: body.text,
      actor: body.actor,
    };
    const account = this.store.get(inbound.tenantId, inbound.accountId);
    if (!account || account.phone !== inbound.from) {
      throw new WorkflowHttpError(404, "Account not found");
    }
    if (this.store.hasHandled(inbound.providerMessageId)) {
      return { duplicate: true, account_state: account.state };
    }

    const decision = decideReply(account, inbound);
    const sent = await this.sendSms(inbound.from, decision.reply, inbound.providerMessageId);
    const updated = { ...account, state: decision.nextState };
    this.store.save(updated);
    this.store.markHandled(inbound.providerMessageId);
    return { duplicate: false, account_state: updated.state, reply_message_id: sent.message_id };
  }
}

export class WorkflowHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const defaultSmsSender: SmsSender = (to, message, idempotencyKey) =>
  infrai.sms.send({ to, body: message }, idempotencyKey);

export function clientStatus(error: unknown): number {
  if (error instanceof WorkflowHttpError) return error.status;
  if (error instanceof InfraiError && error.status >= 400 && error.status < 500) return error.status;
  return 502;
}
