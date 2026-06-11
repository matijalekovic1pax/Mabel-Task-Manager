import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_TIME_ZONE = "Europe/Belgrade";
const DEFAULT_BATCH_LIMIT = 20;
const DEFAULT_MAX_ATTEMPTS = 5;

type DeliveryRow = {
  id: string;
  notification_id: string;
  recipient_id: string;
  task_id: string;
  notification_type: string;
  status: string;
  attempts: number;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  task_id: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: "ceo" | "team_member" | "super_admin";
  is_active: boolean;
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  priority: string;
  deadline: string | null;
  reference_number: string | null;
  submitted_by: string;
  assigned_to: string | null;
  task_type: "approval" | "general";
};

type GmailConfig = {
  appBaseUrl: string;
  senderEmail: string;
  senderName: string;
  serviceAccountEmail: string;
  privateKey: string;
  privateKeyId?: string;
  timeZone: string;
};

type ProcessResult = {
  deliveryId: string;
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  error?: string;
};

type CachedAccessToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedAccessToken: CachedAccessToken | null = null;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const callerId = getUserIdFromAuthorization(authHeader);

    if (!callerId) {
      return jsonResponse({ error: "Missing authenticated user" }, 401);
    }

    const body = await readJsonBody(req);
    const taskId = await resolveTaskId(body);

    if (!taskId) {
      return jsonResponse({ error: "taskId is required" }, 400);
    }

    const admin = createAdminClient();

    await assertCallerCanProcessTask(admin, taskId, callerId);

    const config = getGmailConfig();
    const pendingCount = await countPendingDeliveries(admin, taskId);

    if (!config) {
      return jsonResponse({
        ok: false,
        configured: false,
        pending: pendingCount,
        message: "Gmail notification email secrets are not configured yet.",
      }, 202);
    }

    const limit = getPositiveIntegerEnv("EMAIL_BATCH_LIMIT", DEFAULT_BATCH_LIMIT);
    const maxAttempts = getPositiveIntegerEnv("EMAIL_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
    const results = await processPendingDeliveries(admin, taskId, config, limit, maxAttempts);

    return jsonResponse({
      ok: true,
      configured: true,
      pendingBeforeRun: pendingCount,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({ error: message }, status);
  }
});

async function resolveTaskId(body: Record<string, unknown>): Promise<string | null> {
  if (typeof body.taskId === "string" && body.taskId.length > 0) {
    return body.taskId;
  }

  if (typeof body.deliveryId !== "string" || body.deliveryId.length === 0) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_email_deliveries")
    .select("task_id")
    .eq("id", body.deliveryId)
    .maybeSingle();

  if (error) throw error;
  return data?.task_id ?? null;
}

async function assertCallerCanProcessTask(
  admin: ReturnType<typeof createClient>,
  taskId: string,
  callerId: string,
) {
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", callerId)
    .maybeSingle();

  if (callerError) throw callerError;
  if (!caller?.is_active) throw new HttpError("Inactive users cannot send task emails", 403);

  const { data: task, error: taskError } = await admin
    .from("tasks")
    .select("id, submitted_by, assigned_to")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) throw taskError;
  if (!task) throw new HttpError("Task not found", 404);

  if (
    caller.role === "ceo" ||
    caller.role === "super_admin" ||
    task.submitted_by === callerId ||
    task.assigned_to === callerId
  ) {
    return;
  }

  const { data: assignment, error: assignmentError } = await admin
    .from("task_assignees")
    .select("id")
    .eq("task_id", taskId)
    .or(`assignee_id.eq.${callerId},assigned_by.eq.${callerId}`)
    .limit(1)
    .maybeSingle();

  if (assignmentError) throw assignmentError;
  if (!assignment) throw new HttpError("You cannot send email notifications for this task", 403);
}

async function processPendingDeliveries(
  admin: ReturnType<typeof createClient>,
  taskId: string,
  config: GmailConfig,
  limit: number,
  maxAttempts: number,
): Promise<ProcessResult[]> {
  const { data, error } = await admin
    .from("notification_email_deliveries")
    .select("id, notification_id, recipient_id, task_id, notification_type, status, attempts")
    .eq("task_id", taskId)
    .in("status", ["pending", "failed"])
    .lt("attempts", maxAttempts)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const deliveries = (data ?? []) as DeliveryRow[];
  const results: ProcessResult[] = [];

  for (const delivery of deliveries) {
    results.push(await processDelivery(admin, delivery, config));
  }

  return results;
}

async function processDelivery(
  admin: ReturnType<typeof createClient>,
  delivery: DeliveryRow,
  config: GmailConfig,
): Promise<ProcessResult> {
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("notification_email_deliveries")
    .update({
      status: "processing",
      attempts: delivery.attempts + 1,
      last_attempt_at: now,
      last_error: null,
    })
    .eq("id", delivery.id)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) {
    return { deliveryId: delivery.id, status: "skipped", error: "Delivery was already claimed" };
  }

  try {
    const payload = await loadEmailPayload(admin, delivery);

    if (!payload.recipient.is_active || !payload.recipient.email) {
      await markDeliverySkipped(admin, delivery.id, "Recipient is inactive or missing an email address");
      return {
        deliveryId: delivery.id,
        status: "skipped",
        error: "Recipient is inactive or missing an email address",
      };
    }

    const email = buildEmail(payload.notification, payload.recipient, payload.task, config);
    const messageId = await sendGmail(email, config);

    await admin
      .from("notification_email_deliveries")
      .update({
        status: "sent",
        provider_message_id: messageId,
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", delivery.id);

    return { deliveryId: delivery.id, status: "sent", messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected delivery error";
    await admin
      .from("notification_email_deliveries")
      .update({
        status: "failed",
        last_error: message,
      })
      .eq("id", delivery.id);

    return { deliveryId: delivery.id, status: "failed", error: message };
  }
}

async function loadEmailPayload(admin: ReturnType<typeof createClient>, delivery: DeliveryRow) {
  const [{ data: notification, error: notificationError }, { data: recipient, error: recipientError }] =
    await Promise.all([
      admin
        .from("notifications")
        .select("id, recipient_id, type, title, message, task_id, created_at")
        .eq("id", delivery.notification_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, email, full_name, role, is_active")
        .eq("id", delivery.recipient_id)
        .maybeSingle(),
    ]);

  if (notificationError) throw notificationError;
  if (recipientError) throw recipientError;
  if (!notification) throw new Error("Notification no longer exists");
  if (!recipient) throw new Error("Recipient profile no longer exists");

  const { data: task, error: taskError } = await admin
    .from("tasks")
    .select("id, title, description, priority, deadline, reference_number, submitted_by, assigned_to, task_type")
    .eq("id", delivery.task_id)
    .maybeSingle();

  if (taskError) throw taskError;
  if (!task) throw new Error("Task no longer exists");

  return {
    notification: notification as NotificationRow,
    recipient: recipient as ProfileRow,
    task: task as TaskRow,
  };
}

async function markDeliverySkipped(
  admin: ReturnType<typeof createClient>,
  deliveryId: string,
  reason: string,
) {
  const { error } = await admin
    .from("notification_email_deliveries")
    .update({
      status: "skipped",
      last_error: reason,
    })
    .eq("id", deliveryId);

  if (error) throw error;
}

function buildEmail(
  notification: NotificationRow,
  recipient: ProfileRow,
  task: TaskRow,
  config: GmailConfig,
) {
  const taskLabel = task.reference_number ? `${task.reference_number}: ${task.title}` : task.title;
  const subjectPrefix = notification.type === "task_delegated"
    ? "Task delegated to you"
    : "New task assigned to you";
  const subject = `${subjectPrefix}: ${taskLabel}`;
  const taskUrl = `${config.appBaseUrl}/tasks/${task.id}`;
  const deadline = task.deadline ? formatDateTime(task.deadline, config.timeZone) : "No deadline set";

  const text = [
    `Hi ${recipient.full_name},`,
    "",
    notification.message,
    "",
    `Task: ${taskLabel}`,
    `Priority: ${capitalize(task.priority)}`,
    `Deadline: ${deadline}`,
    "",
    `Open task: ${taskUrl}`,
    "",
    "1PAX Task Manager",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f7f8;color:#18181b;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;">Hi ${escapeHtml(recipient.full_name)},</p>
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#18181b;">${escapeHtml(notification.title)}</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#3f3f46;">${escapeHtml(notification.message)}</p>
        <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:0 0 20px;background:#fafafa;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>Task:</strong> ${escapeHtml(taskLabel)}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Priority:</strong> ${escapeHtml(capitalize(task.priority))}</p>
          <p style="margin:0;font-size:14px;"><strong>Deadline:</strong> ${escapeHtml(deadline)}</p>
        </div>
        <a href="${escapeHtml(taskUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 14px;font-size:14px;font-weight:600;">Open task</a>
      </div>
      <p style="margin:14px 0 0;text-align:center;font-size:12px;color:#71717a;">1PAX Task Manager</p>
    </div>
  </body>
</html>`;

  return {
    to: recipient.email,
    from: config.senderEmail,
    fromName: config.senderName,
    subject,
    text,
    html,
  };
}

async function sendGmail(
  email: { to: string; from: string; fromName: string; subject: string; text: string; html: string },
  config: GmailConfig,
): Promise<string> {
  const accessToken = await getGoogleAccessToken(config);
  const raw = base64UrlEncodeString(buildMimeMessage(email));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const responseText = await response.text();
  const responsePayload = parseJson(responseText);

  if (!response.ok) {
    throw new Error(`Gmail send failed (${response.status}): ${responseText}`);
  }

  if (!responsePayload || typeof responsePayload.id !== "string") {
    throw new Error("Gmail send response did not include a message id");
  }

  return responsePayload.id;
}

function buildMimeMessage(email: {
  to: string;
  from: string;
  fromName: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `1pax_${crypto.randomUUID()}`;

  return [
    `From: ${formatEmailAddress(email.fromName, email.from)}`,
    `To: ${email.to}`,
    `Subject: ${encodeMimeWord(email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    email.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    email.html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

async function getGoogleAccessToken(config: GmailConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.accessToken;
  }

  const assertion = await createGoogleJwt(config, now);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const responseText = await response.text();
  const token = parseJson(responseText);

  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status}): ${responseText}`);
  }

  if (!token || typeof token.access_token !== "string") {
    throw new Error("Google token response did not include an access token");
  }

  const expiresIn = typeof token.expires_in === "number" ? token.expires_in : 3600;
  cachedAccessToken = {
    accessToken: token.access_token,
    expiresAt: now + expiresIn,
  };

  return cachedAccessToken.accessToken;
}

async function createGoogleJwt(config: GmailConfig, now: number): Promise<string> {
  const header: Record<string, string> = { alg: "RS256", typ: "JWT" };
  if (config.privateKeyId) header.kid = config.privateKeyId;

  const claimSet = {
    iss: config.serviceAccountEmail,
    sub: config.senderEmail,
    scope: GMAIL_SEND_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedClaims = base64UrlEncodeString(JSON.stringify(claimSet));
  const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
  const key = await importPrivateKey(config.privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );

  return `${unsignedJwt}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(privateKeyPem);
  return crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function getGmailConfig(): GmailConfig | null {
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const serviceAccount = serviceAccountJson ? parseJson(serviceAccountJson) : null;
  const serviceAccountEmail = getStringEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL") ??
    getStringProperty(serviceAccount, "client_email");
  const privateKey = normalizePrivateKey(
    getStringEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ??
      getStringProperty(serviceAccount, "private_key") ??
      "",
  );
  const privateKeyId = getStringEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID") ??
    getStringProperty(serviceAccount, "private_key_id");
  const senderEmail = getStringEnv("GOOGLE_WORKSPACE_SENDER_EMAIL");
  const appBaseUrl = trimTrailingSlash(getStringEnv("APP_BASE_URL") ?? "");

  if (!serviceAccountEmail || !privateKey || !senderEmail || !appBaseUrl) {
    return null;
  }

  return {
    appBaseUrl,
    senderEmail,
    senderName: getStringEnv("GOOGLE_WORKSPACE_SENDER_NAME") ?? "1PAX Task Manager",
    serviceAccountEmail,
    privateKey,
    privateKeyId,
    timeZone: getStringEnv("EMAIL_TIME_ZONE") ?? DEFAULT_TIME_ZONE,
  };
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getServiceRoleKey(): string | null {
  const legacy = getStringEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const parsed = secretKeys ? parseJson(secretKeys) : null;
  return getStringProperty(parsed, "default");
}

async function countPendingDeliveries(
  admin: ReturnType<typeof createClient>,
  taskId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("notification_email_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId)
    .in("status", ["pending", "failed"]);

  if (error) throw error;
  return count ?? 0;
}

function getUserIdFromAuthorization(authHeader: string): string | null {
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const [, payload] = token.split(".");
  if (!payload) return null;

  const decoded = parseJson(base64UrlDecodeString(payload));
  return getStringProperty(decoded, "sub");
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function getStringEnv(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

function getStringProperty(value: Record<string, unknown> | null, key: string): string | undefined {
  const property = value?.[key];
  return typeof property === "string" && property.length > 0 ? property : undefined;
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n").trim();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function formatDateTime(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/_/g, " ")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeMimeWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64EncodeString(value)}?=`;
}

function formatEmailAddress(name: string, email: string): string {
  return name ? `${encodeMimeWord(name)} <${email}>` : email;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function base64EncodeString(value: string): string {
  return base64EncodeBytes(new TextEncoder().encode(value));
}

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return base64EncodeBytes(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
