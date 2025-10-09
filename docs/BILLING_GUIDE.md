# Kamiyo Billing Guide

Complete guide to managing your Kamiyo subscription, billing, and payment methods.

## Table of Contents

1. [Overview](#overview)
2. [Subscription Plans](#subscription-plans)
3. [Managing Your Subscription](#managing-your-subscription)
4. [Payment Methods](#payment-methods)
5. [Invoices](#invoices)
6. [Usage Tracking](#usage-tracking)
7. [FAQ](#faq)
8. [Support](#support)

---

## Overview

Kamiyo offers a flexible subscription model with four tiers designed to meet different needs:

- **Free**: Perfect for getting started
- **Basic**: For individual developers and small teams
- **Pro**: For growing teams and organizations
- **Enterprise**: For large organizations with custom needs

All billing is handled securely through Stripe, and you can manage your subscription, payment methods, and invoices through the Billing Dashboard.

---

## Subscription Plans

### Free Tier - $0/month

**Perfect for:**
- Individual developers exploring exploit intelligence
- Personal projects and learning
- Testing the platform before upgrading

**Features:**
- 100 API requests per day
- 7 days of historical data
- Email alerts
- Community support
- CSV/JSON export

**Limitations:**
- No Discord or Telegram alerts
- Limited historical data access
- Rate limits apply

---

### Basic Tier - $29/month

**Perfect for:**
- Individual developers with regular needs
- Small teams (1-3 people)
- Side projects and startups

**Features:**
- 1,000 API requests per day (10x Free tier)
- 30 days of historical data
- Email + Discord alerts
- Real-time alert delivery
- Email support
- All Free tier features

**What's New:**
- Discord integration
- 4x more historical data
- 10x higher rate limits
- Real-time notifications
- Priority email support

---

### Pro Tier - $99/month

**Perfect for:**
- Development teams
- Security-conscious organizations
- Active protocol monitoring

**Features:**
- 10,000 API requests per day (100x Free tier)
- 90 days of historical data
- Email + Discord + Telegram + Webhooks
- Real-time alert delivery
- Priority support
- All Basic tier features

**What's New:**
- Telegram integration
- Webhook support
- 3x more historical data
- 10x higher rate limits
- Priority support queue

---

### Enterprise Tier - $499/month

**Perfect for:**
- Large organizations
- Security firms
- Mission-critical monitoring

**Features:**
- Unlimited API requests
- Unlimited historical data
- All alert channels
- Custom integrations
- Dedicated account manager
- SLA guarantee (99.9% uptime)
- White label option
- 24/7 dedicated support

**What's New:**
- No rate limits
- Complete historical archive
- Custom integration support
- Personal account manager
- Service level agreement
- White label branding
- Round-the-clock support

---

## Managing Your Subscription

### Accessing the Billing Dashboard

1. Log in to your Kamiyo account
2. Navigate to **Settings** > **Billing**
3. View your current plan and usage

The Billing Dashboard provides:
- Current plan overview
- Real-time usage statistics
- Upcoming invoice preview
- Payment method management
- Invoice history

### Upgrading Your Subscription

**To upgrade to a higher tier:**

1. Go to **Billing** > **Plans** tab
2. Select your desired plan
3. Click **Upgrade**
4. Review the confirmation dialog
5. Confirm the upgrade

**What happens when you upgrade:**
- You're charged immediately for the new plan
- Proration credit is applied for unused time on your current plan
- Your new rate limits take effect immediately
- You gain access to all new features instantly

**Example:**
If you upgrade from Basic ($29/month) to Pro ($99/month) on day 15 of your billing cycle:
- Unused Basic time: ~$14.50 credit
- Pro plan charge: $99.00
- Net charge: $84.50

### Downgrading Your Subscription

**To downgrade to a lower tier:**

1. Go to **Billing** > **Plans** tab
2. Select a lower-tier plan
3. Click **Downgrade**
4. Review the confirmation dialog
5. Confirm the downgrade

**What happens when you downgrade:**
- Your current plan continues until the end of the billing period
- The new plan takes effect on your next billing date
- You retain all features until the period ends
- No refunds are issued for the current period

**Important:** If you're using features not available in the lower tier (e.g., webhooks), you'll need to disable them before the downgrade takes effect.

### Canceling Your Subscription

**To cancel your subscription:**

1. Go to **Billing** > **Overview** tab
2. Click **Manage Billing**
3. In the Stripe Customer Portal, click **Cancel Plan**
4. Select a cancellation reason (optional)
5. Confirm cancellation

**What happens when you cancel:**
- Your subscription remains active until the end of the current billing period
- You retain all paid features until the period ends
- After the period ends, you're automatically downgraded to the Free tier
- No refunds are issued for partial months

**Can I reactivate?**
Yes! You can resubscribe at any time from the Billing Dashboard.

---

## Payment Methods

### Adding a Payment Method

**To add a payment method:**

1. Go to **Billing** > **Payment** tab
2. Click **Add Payment Method**
3. You'll be redirected to the Stripe Customer Portal
4. Enter your card details:
   - Card number
   - Expiration date
   - CVC code
   - Billing address
5. Click **Save**

**Supported payment methods:**
- Visa
- Mastercard
- American Express
- Discover
- Diners Club
- JCB
- UnionPay

### Updating Your Payment Method

**To update your payment method:**

1. Go to **Billing** > **Payment** tab
2. Click **Update** next to your current payment method
3. In the Stripe Customer Portal, click **Add Payment Method**
4. Enter new card details
5. Set as default (if desired)
6. Remove old payment method (optional)

**When to update:**
- Card expiring soon
- Card lost or stolen
- Changing billing address
- Updating to a different card

**Expiration warnings:**
You'll receive email notifications when your card is expiring:
- 60 days before expiration
- 30 days before expiration
- 7 days before expiration

### Removing a Payment Method

**To remove a payment method:**

1. Go to **Billing** > **Payment** tab
2. Click **Manage**
3. In the Stripe Customer Portal, locate the payment method
4. Click **Remove**
5. Confirm removal

**Note:** You cannot remove your default payment method if you have an active paid subscription. Add a new payment method and set it as default first.

---

## Invoices

### Viewing Your Invoices

**To view your invoice history:**

1. Go to **Billing** > **Invoices** tab
2. Browse your invoice history
3. Click **View** to see invoice details
4. Click **PDF** to download the invoice

**Invoice information includes:**
- Invoice number
- Billing date
- Amount charged
- Payment status
- Billing period
- Line items (subscription, prorations, etc.)

### Downloading Invoices

**To download an invoice:**

1. Go to **Billing** > **Invoices** tab
2. Find the invoice you need
3. Click **PDF** in the Actions column
4. The PDF will download to your device

**Use cases for invoices:**
- Expense reporting
- Tax preparation
- Accounting records
- Reimbursement requests

### Understanding Your Invoice

**Invoice structure:**

```
Invoice #: INV-2024-001234
Date: January 15, 2024
Amount: $99.00

Line Items:
- Pro Plan (Jan 15 - Feb 14): $99.00
- Proration credit (Basic): -$14.50
- Total: $84.50

Payment Method: Visa ****1234
Status: Paid
```

**Common line items:**
- **Subscription**: Monthly charge for your plan
- **Proration credit**: Refund for unused time when upgrading
- **Proration charge**: Additional charge when upgrading mid-cycle

### Payment Failed?

**If a payment fails:**

1. You'll receive an email notification
2. Your subscription status changes to "past_due"
3. Stripe will retry the payment automatically (up to 4 times)
4. Update your payment method to resolve the issue

**To fix a failed payment:**

1. Go to **Billing** > **Payment** tab
2. Update your payment method
3. Stripe will automatically retry the charge
4. Your subscription will be reactivated

**Grace period:**
You have 7 days to resolve payment issues before your subscription is canceled and downgraded to Free tier.

---

## Usage Tracking

### Viewing Your Usage

**To view your API usage:**

1. Go to **Billing** > **Usage** tab
2. Select time range (Day / Week / Month)
3. View your usage chart and statistics

**Usage metrics displayed:**
- Current day usage
- Current hour usage
- Current minute usage
- Remaining requests
- Endpoint breakdown
- Historical trends

### Understanding Rate Limits

**Rate limits by tier:**

| Tier       | Per Minute | Per Hour | Per Day   |
|------------|------------|----------|-----------|
| Free       | 5          | 20       | 100       |
| Basic      | 10         | 100      | 1,000     |
| Pro        | 50         | 1,000    | 10,000    |
| Enterprise | 1,000      | 99,999   | Unlimited |

**What happens when you hit the limit:**
- API requests are rejected with HTTP 429 (Too Many Requests)
- Response includes `Retry-After` header
- Usage resets at the next time window

**Tips to avoid hitting limits:**
1. Implement exponential backoff
2. Cache API responses when appropriate
3. Use webhooks instead of polling (Pro/Enterprise)
4. Upgrade to a higher tier if consistently hitting limits

### Optimizing Your Usage

**Best practices:**

1. **Use webhooks** (Pro/Enterprise): Get real-time updates instead of polling
2. **Implement caching**: Store responses locally when data doesn't change frequently
3. **Batch requests**: Combine multiple operations when possible
4. **Filter data**: Request only the data you need
5. **Monitor usage**: Check your dashboard regularly to understand patterns

---

## FAQ

### Billing & Payments

**Q: When will I be charged?**

A: You're charged on the same day each month (your billing anniversary date). For example, if you subscribe on January 15th, you'll be charged on the 15th of each subsequent month.

**Q: Can I get a refund?**

A: We don't offer refunds for partial months. If you cancel, your subscription remains active until the end of the current billing period.

**Q: Do you offer annual billing?**

A: Annual billing is available for Pro and Enterprise plans. Contact sales@kamiyo.io for pricing.

**Q: Can I pause my subscription?**

A: You can cancel your subscription and resubscribe later. Your account and settings are preserved, but historical data older than your plan's limit is removed.

**Q: What payment methods do you accept?**

A: We accept all major credit cards (Visa, Mastercard, American Express, Discover) via Stripe. ACH/wire transfers are available for Enterprise customers.

### Plans & Features

**Q: Can I switch plans mid-cycle?**

A: Yes! Upgrades take effect immediately with proration. Downgrades take effect at the end of your current billing period.

**Q: What happens to my data if I downgrade?**

A: Your account and settings are preserved. However, historical data older than your new plan's limit is no longer accessible through the API.

**Q: Can I exceed my rate limit temporarily?**

A: No, rate limits are hard limits. If you need higher limits, upgrade your plan.

**Q: Is there a free trial?**

A: The Free tier is available indefinitely, so you can evaluate the platform before upgrading. Paid plans don't offer free trials, but you can cancel anytime.

### Technical

**Q: How do I integrate Kamiyo into my application?**

A: See our [API Documentation](https://docs.kamiyo.io) for integration guides.

**Q: Do you have a status page?**

A: Yes, check [status.kamiyo.io](https://status.kamiyo.io) for real-time system status.

**Q: What's your uptime guarantee?**

A: Enterprise customers have a 99.9% uptime SLA. Other tiers operate on a best-effort basis.

**Q: How do I export my data?**

A: All plans include CSV and JSON export. Navigate to the data you want to export and click the Export button.

---

## Support

### Getting Help

**Free Tier:**
- Community forum: [community.kamiyo.io](https://community.kamiyo.io)
- Documentation: [docs.kamiyo.io](https://docs.kamiyo.io)

**Basic Tier:**
- Email support: support@kamiyo.io
- Response time: Within 48 hours
- All Free tier resources

**Pro Tier:**
- Priority email support: support@kamiyo.io
- Response time: Within 24 hours
- Live chat (business hours)
- All Basic tier resources

**Enterprise Tier:**
- Dedicated account manager
- 24/7 phone support
- Response time: Within 4 hours
- Dedicated Slack channel
- All Pro tier resources

### Contact Information

**General Support:**
- Email: support@kamiyo.io
- Web: https://kamiyo.io/support

**Sales & Upgrades:**
- Email: sales@kamiyo.io
- Phone: +1 (555) 123-4567

**Billing Questions:**
- Email: billing@kamiyo.io

**Security Issues:**
- Email: security@kamiyo.io
- PGP Key: Available at https://kamiyo.io/pgp

---

## Additional Resources

- [API Documentation](https://docs.kamiyo.io)
- [Integration Guides](https://docs.kamiyo.io/integrations)
- [Status Page](https://status.kamiyo.io)
- [Privacy Policy](https://kamiyo.io/privacy)
- [Terms of Service](https://kamiyo.io/terms)
- [Security](https://kamiyo.io/security)

---

**Last Updated:** January 2024

**Questions?** Contact us at support@kamiyo.io
