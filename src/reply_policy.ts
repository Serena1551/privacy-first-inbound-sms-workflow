export type AccountState = "pending" | "active" | "paused";

export type Account = {
  tenantId: string;
  accountId: string;
  phone: string;
  state: AccountState;
};

export type InboundReply = {
  tenantId: string;
  accountId: string;
  providerMessageId: string;
  from: string;
  text: string;
  actor: "member" | "admin";
};

export type ReplyDecision = {
  nextState: AccountState;
  reply: string;
};

export function decideReply(account: Account, inbound: InboundReply): ReplyDecision {
  const command = inbound.text.trim().toUpperCase();

  if (command === "START" && account.state !== "active") {
    return { nextState: "active", reply: "Account notifications are active." };
  }
  if (command === "STOP" && account.state === "active") {
    return { nextState: "paused", reply: "Account notifications are paused." };
  }
  if (command === "STATUS" && inbound.actor === "admin") {
    return { nextState: account.state, reply: `Account status: ${account.state}.` };
  }
  return {
    nextState: account.state,
    reply: "Reply START to activate notifications or STOP to pause them.",
  };
}
