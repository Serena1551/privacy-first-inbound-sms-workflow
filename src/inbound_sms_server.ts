import { createServer } from "node:http";
import {
  clientStatus,
  defaultSmsSender,
  inboundReplySchema,
  InboundSmsWorkflow,
  InMemoryAccountStore,
} from "./inbound_sms_service.ts";

const store = new InMemoryAccountStore();
store.seed({
  tenantId: "clinic-north",
  accountId: "acct-1042",
  phone: "+15551234567",
  state: "pending",
});
const workflow = new InboundSmsWorkflow(store, defaultSmsSender);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/inbound/sms") {
    response.writeHead(404).end();
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = inboundReplySchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Invalid inbound SMS body", issues: parsed.error.issues }));
      return;
    }
    const result = await workflow.handle(parsed.data);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(clientStatus(error), { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Inbound SMS service listening on http://localhost:${port}`));
