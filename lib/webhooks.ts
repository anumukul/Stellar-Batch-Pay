import crypto from "crypto";

export interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
  secret: string;
}

/** Safe public view of a registration — never exposes the full secret. */
export interface WebhookRegistrationRedacted {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
  /** First 8 chars of the HMAC secret for display/debug only. */
  secretPrefix: string;
}

// RFC1918 + localhost CIDR patterns that must not receive server-side POSTs.
const PRIVATE_HOSTNAME_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/i;

/**
 * Validate that a webhook target URL is safe for server-side delivery.
 *
 * Rules:
 *  - Must use HTTPS (not HTTP).
 *  - Hostname must not resolve to RFC1918 / localhost addresses.
 *
 * Returns `null` on success or an error string on failure.
 */
export function validateWebhookUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "URL is invalid.";
  }

  if (parsed.protocol !== "https:") {
    return "Webhook URL must use HTTPS.";
  }

  if (PRIVATE_HOSTNAME_RE.test(parsed.hostname)) {
    return "Webhook URL must not target private/local addresses.";
  }

  return null;
}

// In-memory store for demonstration. In production, this would be a database.
let webhooks: WebhookRegistration[] = [];

export function registerWebhook(url: string, events: string[], secret?: string): WebhookRegistration {
  const newWebhook: WebhookRegistration = {
    id: crypto.randomUUID(),
    url,
    events,
    createdAt: new Date().toISOString(),
    secret: secret || crypto.randomBytes(32).toString('hex'),
  };
  webhooks.push(newWebhook);
  return newWebhook;
}

export function verifyWebhookSignature(payload: string, secret: string, signature: string): boolean {
  const expectedSignature = crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
}

export function unregisterWebhook(id: string): boolean {
  const initialLength = webhooks.length;
  webhooks = webhooks.filter((w) => w.id !== id);
  return webhooks.length < initialLength;
}

export function getWebhooks(): WebhookRegistration[] {
  return [...webhooks];
}

/** Returns webhook list with secrets stripped to a short prefix. */
export function getWebhooksRedacted(): WebhookRegistrationRedacted[] {
  return webhooks.map(({ id, url, events, createdAt, secret }) => ({
    id,
    url,
    events,
    createdAt,
    secretPrefix: secret.slice(0, 8),
  }));
}

export async function triggerWebhooks(eventName: string, payload: any) {
  const targets = webhooks.filter((w) => w.events.includes(eventName) || w.events.includes("*"));
   
  const results = await Promise.allSettled(
    targets.map(async (webhook) => {
      try {
        const timestamp = new Date().toISOString();
        const bodyPayload = { event: eventName, payload, timestamp };
        const body = JSON.stringify(bodyPayload);
        
        const signature = crypto.createHmac('sha256', webhook.secret)
          .update(body)
          .digest('hex');
        
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Stellar-Batch-Pay-Event": eventName,
            "x-webhook-signature": signature,
          },
          body,
        });
        return { id: webhook.id, success: response.ok, status: response.status };
      } catch (error) {
        return { id: webhook.id, success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    })
  );

  return results;
}
