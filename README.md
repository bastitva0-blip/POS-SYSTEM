# POS System — Free Bill Sender

Sends PDF bills via WhatsApp Web + Gmail. Runs 100% free on Vercel.

## Stack
- **Runtime**: Vercel Serverless (Node.js)
- **PDF**: pdf-lib (pure JS, no Chrome needed)
- **DB + Storage**: Supabase
- **Delivery**: wa.me links + Gmail compose links (no paid APIs)

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Add environment variables (see `.env.example`)
4. Deploy ✅

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ENCRYPTION_KEY` | 32-byte hex key for PII decryption |
| `FRONTEND_URL` | Your frontend URL (for CORS) |

Generate encryption key:
```bash
openssl rand -hex 32
```

## Supabase Setup

Create a `bills` storage bucket (public), and add columns:
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
```

## API

`POST /api/bill/send-free`
```json
{
  "invoiceId": "uuid",
  "overridePhone": "+919876543210",
  "overrideEmail": "customer@example.com"
}
```
