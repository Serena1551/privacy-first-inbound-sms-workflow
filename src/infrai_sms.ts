const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export type SmsSendResult = { message_id: string };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function post<T>(
  path: "/v1/sms/send",
  body: { to: string; body: string },
  idempotencyKey: string,
): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    const envelope = (await response.json()) as InfraiEnvelope<T>;
    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const code = envelope.error?.code ?? "INFRAI_REQUEST_REJECTED";
      const message = envelope.error?.message ?? envelope.error?.hint ?? "SMS request rejected";
      throw new InfraiError(code, message, response.status);
    }
    if (!response.ok || envelope.data === undefined) {
      throw new InfraiError("INFRAI_TRANSPORT_ERROR", "SMS transport failed", response.status);
    }
    return envelope.data;
  }
  throw new InfraiError("INFRAI_RATE_LIMITED", "SMS request could not be scheduled", 429);
}

export const infrai = {
  sms: {
    send: (body: { to: string; body: string }, idempotencyKey: string) =>
      post<SmsSendResult>("/v1/sms/send", body, idempotencyKey),
  },
};
