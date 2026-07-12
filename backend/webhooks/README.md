# Third-Party Webhooks

This directory handles incoming event webhooks from external services.

## Key Responsibilities
- Handling NOWPayments IPN (Instant Payment Notification) postbacks.
- Handling Stripe webhook events (e.g., checkout success, failed payments).
- Verifying webhook signatures to guarantee requests originate from trusted payment processors.
