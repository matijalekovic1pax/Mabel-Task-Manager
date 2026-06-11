# Email Notifications

Task assignment email is implemented as a durable queue:

1. Existing database triggers create rows in `public.notifications`.
2. `private.enqueue_notification_email_delivery()` mirrors assignment notifications into `public.notification_email_deliveries`.
3. The React service layer invokes the `send-notification-email` Supabase Edge Function after general-task assignment and approval-task delegation.
4. The Edge Function sends pending rows through the Gmail API using Google Workspace domain-wide delegation.

The Edge Function is intentionally best-effort from the app's point of view. If Google Workspace secrets are missing or Gmail returns an error, task creation still succeeds and delivery rows remain visible to the service-role backend for retry/debugging.

## Required Supabase Secrets

Set these in Supabase Dashboard → Edge Functions → Secrets:

```text
GOOGLE_SERVICE_ACCOUNT_JSON=<full JSON key for the delegated service account>
GOOGLE_WORKSPACE_SENDER_EMAIL=tasks@your-domain.com
APP_BASE_URL=https://your-production-app-url
```

Optional:

```text
GOOGLE_WORKSPACE_SENDER_NAME=1PAX Task Manager
EMAIL_TIME_ZONE=Europe/Belgrade
EMAIL_BATCH_LIMIT=20
EMAIL_MAX_ATTEMPTS=5
```

If you prefer not to store the full JSON blob, use these instead of `GOOGLE_SERVICE_ACCOUNT_JSON`:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the JSON key>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private_key from the JSON key>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID=<private_key_id from the JSON key>
```

## Google Workspace Setup

1. Create or choose a Google Cloud project.
2. Enable the Gmail API.
3. Create a service account and enable domain-wide delegation for it.
4. Create a JSON key for that service account.
5. In Google Admin Console, add the service account's OAuth client ID under domain-wide delegation with this scope:

```text
https://www.googleapis.com/auth/gmail.send
```

6. Make sure `GOOGLE_WORKSPACE_SENDER_EMAIL` is a real Workspace mailbox or valid send-as alias in your domain.

Google's Gmail API expects MIME messages encoded into the `raw` message field, and the function follows that flow.
