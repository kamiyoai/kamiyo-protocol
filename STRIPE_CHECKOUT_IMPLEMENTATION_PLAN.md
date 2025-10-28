# KAMIYO MCP Stripe Checkout Implementation Plan
**Date:** October 28, 2025
**Objective:** Connect pricing page buttons to Stripe checkout for MCP subscriptions

---

## Current State Analysis

**What Exists:**
- ✅ Pricing tiers defined: Personal ($19), Team ($99), Enterprise ($299), x402 ($0.01/query)
- ✅ PricingCard component with buttons
- ✅ Existing Stripe integration in `/api/billing/`
- ✅ MCP authentication system (Phase 2 complete)
- ✅ Token generation system ready

**What's Missing:**
- ❌ Stripe products/prices for MCP tiers not created
- ❌ Checkout session creation endpoint
- ❌ Frontend button handlers don't call checkout
- ❌ Success page after checkout
- ❌ Webhook integration with MCP token generation

**Current Button Behavior:**
- Homepage: "Add to Claude Desktop" → does nothing
- Pricing page: Various buttons → incomplete handlers
- Need: All buttons → Stripe checkout (except Enterprise/x402)

---

## Implementation Plan

### Phase 1: Stripe Product Setup (Stripe CLI)

**Deliverable:** `scripts/stripe/create_mcp_products.sh`

**Products to Create:**

1. **MCP Personal**
   - Name: "KAMIYO MCP Personal"
   - Price: $19/month (recurring)
   - Description: "Unlimited security queries for AI agents via Claude Desktop. 1 AI agent, 30 requests/min."
   - Metadata:
     - tier: "personal"
     - max_agents: "1"
     - rate_limit_rpm: "30"
     - rate_limit_daily: "1000"

2. **MCP Team**
   - Name: "KAMIYO MCP Team"
   - Price: $99/month (recurring)
   - Description: "Team subscription with 5 AI agents, team workspace, webhooks, and priority support."
   - Metadata:
     - tier: "team"
     - max_agents: "5"
     - rate_limit_rpm: "100"
     - rate_limit_daily: "10000"

3. **MCP Enterprise**
   - Name: "KAMIYO MCP Enterprise"
   - Price: $299/month (recurring)
   - Description: "Unlimited AI agents, 99.9% SLA, dedicated support, custom integrations."
   - Metadata:
     - tier: "enterprise"
     - max_agents: "unlimited"
     - rate_limit_rpm: "500"
     - rate_limit_daily: "100000"

**Script Requirements:**
- Check if products already exist (idempotent)
- Support both test and live mode via flag
- Output price IDs for .env configuration
- Save product/price IDs to `stripe_product_ids.txt`

**Commands:**
```bash
# Create product
stripe products create \
  --name "KAMIYO MCP Personal" \
  --description "Unlimited security queries for AI agents" \
  --metadata[tier]=personal \
  --metadata[max_agents]=1

# Create price
stripe prices create \
  --product=prod_xxx \
  --unit-amount=1900 \
  --currency=usd \
  --recurring[interval]=month

# List to verify
stripe products list
stripe prices list
```

---

### Phase 2: Backend API Endpoints

**Deliverable:** `api/billing/checkout.py` (new file)

#### Endpoint 1: Create Checkout Session

**Route:** `POST /api/billing/create-checkout-session`

**Request Body:**
```json
{
  "tier": "personal",
  "user_email": "user@example.com",
  "success_url": "https://kamiyo.io/dashboard/success?session_id={CHECKOUT_SESSION_ID}",
  "cancel_url": "https://kamiyo.io/pricing"
}
```

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_...",
  "session_id": "cs_test_..."
}
```

**Implementation:**
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import stripe
import os

router = APIRouter()
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

class CheckoutRequest(BaseModel):
    tier: str  # personal, team, enterprise
    user_email: str | None = None
    success_url: str = "https://kamiyo.io/dashboard/success"
    cancel_url: str = "https://kamiyo.io/pricing"

@router.post("/create-checkout-session")
async def create_checkout_session(request: CheckoutRequest):
    # Get price ID for tier
    price_ids = {
        "personal": os.getenv("STRIPE_PRICE_MCP_PERSONAL"),
        "team": os.getenv("STRIPE_PRICE_MCP_TEAM"),
        "enterprise": os.getenv("STRIPE_PRICE_MCP_ENTERPRISE")
    }

    if request.tier not in price_ids:
        raise HTTPException(400, "Invalid tier")

    # Create checkout session
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{
            "price": price_ids[request.tier],
            "quantity": 1
        }],
        customer_email=request.user_email,
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        metadata={
            "tier": request.tier,
            "product_type": "mcp"
        },
        subscription_data={
            "metadata": {
                "tier": request.tier,
                "product_type": "mcp"
            }
        }
    )

    return {
        "checkout_url": session.url,
        "session_id": session.id
    }
```

#### Endpoint 2: Verify Checkout Session

**Route:** `GET /api/billing/checkout-session/{session_id}`

**Response:**
```json
{
  "status": "complete",
  "customer_email": "user@example.com",
  "tier": "personal",
  "subscription_id": "sub_...",
  "amount_total": 1900
}
```

**Purpose:** Used on success page to show order details

#### Endpoint 3: Customer Portal (Future)

**Route:** `POST /api/billing/create-portal-session`

**Purpose:** Allow users to manage subscriptions, payment methods

---

### Phase 3: Frontend Integration

#### Update: `components/PricingCard.js`

**Current Issue:** `onSelect` prop doesn't do anything useful

**Fix:**

```javascript
export default function PricingCard({ plan, isHighlighted = false }) {
    const [isRedirecting, setIsRedirecting] = useState(false);
    const router = useRouter();
    const { data: session } = useSession();

    const handleSelect = async () => {
        const { tier } = plan;

        // Enterprise: redirect to contact
        if (tier === 'enterprise') {
            router.push('/inquiries');
            return;
        }

        // x402: redirect to docs
        if (tier === 'x402') {
            router.push('/api-docs');
            return;
        }

        // Personal/Team: Stripe checkout
        setIsRedirecting(true);

        try {
            const response = await fetch('/api/billing/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: tier,
                    user_email: session?.user?.email,
                    success_url: `${window.location.origin}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${window.location.origin}/pricing`
                })
            });

            if (!response.ok) {
                throw new Error('Checkout failed');
            }

            const { checkout_url } = await response.json();
            window.location.href = checkout_url;
        } catch (error) {
            console.error('Checkout error:', error);
            alert('Unable to start checkout. Please try again.');
            setIsRedirecting(false);
        }
    };

    return (
        <div className="...">
            {/* ... existing code ... */}

            <PayButton
                textOverride={
                    isRedirecting ? 'Processing...' :
                    tier === 'personal' ? 'Subscribe - $19/mo' :
                    tier === 'team' ? 'Subscribe - $99/mo' :
                    tier === 'enterprise' ? 'Contact Sales' :
                    'View API Docs'
                }
                onClickOverride={handleSelect}
                disabled={isRedirecting}
            />
        </div>
    );
}
```

**Changes:**
- Add state for loading indicator
- Add checkout API call
- Handle Enterprise/x402 special cases
- Show clear error messages
- Update button text to be action-oriented

#### Update: `pages/index.js`

**Current:** Buttons pass `onSelect` handler

**Fix:** Ensure handlers are properly connected (same logic as PricingCard)

#### Update: `pages/pricing.js`

**Current:** Similar issue

**Fix:** Use updated PricingCard component (should auto-fix)

#### Create: `pages/dashboard/success.js`

**New Page:** Post-checkout success

```javascript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

export default function CheckoutSuccess() {
    const router = useRouter();
    const { session_id } = router.query;
    const { data: session } = useSession();
    const [orderDetails, setOrderDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (session_id) {
            fetch(`/api/billing/checkout-session/${session_id}`)
                .then(res => res.json())
                .then(data => {
                    setOrderDetails(data);
                    setLoading(false);
                });
        }
    }, [session_id]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="max-w-2xl p-8">
                <h1 className="text-3xl font-light mb-4">
                    ✅ Subscription Successful!
                </h1>

                {loading ? (
                    <p>Loading order details...</p>
                ) : (
                    <>
                        <p className="mb-4">
                            Thank you for subscribing to KAMIYO MCP {orderDetails?.tier}!
                        </p>

                        <div className="bg-gray-900 border border-cyan p-6 rounded-lg mb-6">
                            <h2 className="text-xl mb-4">Next Steps:</h2>
                            <ol className="space-y-2 text-sm">
                                <li>1. Check your email for MCP token</li>
                                <li>2. Follow setup instructions to add to Claude Desktop</li>
                                <li>3. Start using: "Search for recent crypto exploits"</li>
                            </ol>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="btn-primary"
                            >
                                Go to Dashboard
                            </button>
                            <button
                                onClick={() => router.push('/mcp/setup')}
                                className="btn-secondary"
                            >
                                View Setup Guide
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
```

---

### Phase 4: Webhook Integration

**Update:** `api/billing/stripe_webhooks.py` or create `api/webhooks/stripe_mcp.py`

**Event:** `checkout.session.completed`

**Handler Flow:**

```python
async def handle_checkout_completed(event):
    session = event['data']['object']

    # Extract data
    customer_email = session['customer_email']
    subscription_id = session['subscription']
    tier = session['metadata']['tier']

    # 1. Get or create user
    user = await get_or_create_user(customer_email)

    # 2. Generate MCP token
    from mcp.auth import create_mcp_token
    token = create_mcp_token(
        user_id=str(user.id),
        tier=tier,
        subscription_id=subscription_id,
        expires_days=365
    )

    # 3. Store token in database
    from database import store_mcp_token
    await store_mcp_token(user.id, token, tier, subscription_id)

    # 4. Send email with token and setup instructions
    from email_service import send_mcp_setup_email
    await send_mcp_setup_email(
        to=customer_email,
        token=token,
        tier=tier,
        setup_url="https://kamiyo.io/mcp/setup"
    )

    return {"status": "success"}
```

**Other Events to Handle:**
- `customer.subscription.updated` → Update tier
- `customer.subscription.deleted` → Revoke access
- `invoice.payment_failed` → Notify user

---

### Phase 5: Environment Configuration

**Update:** `.env.example`

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe MCP Product Price IDs
STRIPE_PRICE_MCP_PERSONAL=price_...
STRIPE_PRICE_MCP_TEAM=price_...
STRIPE_PRICE_MCP_ENTERPRISE=price_...

# Or use product IDs if prices are defined in Stripe
STRIPE_PRODUCT_MCP_PERSONAL=prod_...
STRIPE_PRODUCT_MCP_TEAM=prod_...
STRIPE_PRODUCT_MCP_ENTERPRISE=prod_...
```

**Create:** `scripts/setup_env_from_stripe.sh`

Helper script to extract price IDs from Stripe and add to .env

---

### Phase 6: Testing & Validation

#### Setup Test Environment

```bash
# 1. Install Stripe CLI
brew install stripe/stripe-cli/stripe

# 2. Login to Stripe
stripe login

# 3. Create test products
bash scripts/stripe/create_mcp_products.sh --test

# 4. Start webhook forwarding
stripe listen --forward-to localhost:8000/api/webhooks/stripe

# 5. Get webhook secret from CLI output
# Add to .env: STRIPE_WEBHOOK_SECRET=whsec_...
```

#### Test Checkout Flow

**Test Cases:**

1. **Personal Tier Checkout**
   - Click "Subscribe - $19/mo" button
   - Should redirect to Stripe checkout
   - Use test card: 4242 4242 4242 4242
   - Should redirect to success page
   - Should receive webhook event
   - Should generate MCP token
   - Should send email (check logs)

2. **Team Tier Checkout**
   - Same flow with $99/mo
   - Verify tier metadata correct

3. **Enterprise Tier**
   - Click "Contact Sales"
   - Should redirect to /inquiries
   - Should NOT go to Stripe

4. **x402 Tier**
   - Click "View API Docs"
   - Should redirect to /api-docs
   - Should NOT go to Stripe

5. **Cancel Flow**
   - Start checkout
   - Click back button
   - Should return to pricing page
   - Should NOT create subscription

6. **Success Page**
   - Complete checkout
   - Should show order details
   - Should show next steps
   - Should have links to dashboard and setup

#### Webhook Testing

```bash
# Trigger test webhook
stripe trigger checkout.session.completed

# Verify:
# - Token created in database
# - Email sent (check logs)
# - User can authenticate with token
```

---

### Phase 7: Email Templates

**Create:** `api/email/templates/mcp_setup.html`

```html
<!DOCTYPE html>
<html>
<head>
    <title>Welcome to KAMIYO MCP</title>
</head>
<body>
    <h1>Welcome to KAMIYO MCP {{ tier }}!</h1>

    <p>Thank you for subscribing. Here's your MCP token:</p>

    <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
        <code>{{ token }}</code>
    </div>

    <h2>Setup Instructions:</h2>

    <ol>
        <li>Open Claude Desktop</li>
        <li>Go to Settings → MCP Servers</li>
        <li>Add KAMIYO server with your token</li>
        <li>Restart Claude Desktop</li>
        <li>Try: "Search for recent crypto exploits"</li>
    </ol>

    <p>
        <a href="https://kamiyo.io/mcp/setup">View detailed setup guide</a>
    </p>

    <p>
        Need help? Reply to this email or visit our support page.
    </p>
</body>
</html>
```

---

## Implementation Order

### Day 1 Morning: Stripe Setup
1. Create products/prices with Stripe CLI
2. Save price IDs to .env
3. Test with `stripe products list`

### Day 1 Afternoon: Backend API
1. Create `api/billing/checkout.py`
2. Implement checkout session endpoint
3. Test with curl/Postman

### Day 2 Morning: Frontend Integration
1. Update PricingCard component
2. Update pages (index.js, pricing.js)
3. Create success page
4. Test button clicks

### Day 2 Afternoon: Webhook & Email
1. Update webhook handlers
2. Integrate MCP token generation
3. Create email template
4. Test end-to-end flow

---

## Success Criteria

✅ **Products Created:**
- 3 MCP products in Stripe with correct prices
- Metadata configured correctly
- Price IDs saved in .env

✅ **Checkout Working:**
- Buttons redirect to Stripe checkout
- Checkout completes successfully
- Redirects to success page with details

✅ **Token Generation:**
- Webhook triggers on checkout.session.completed
- MCP token generated and stored
- Email sent with token and instructions

✅ **User Experience:**
- Clear button labels
- Loading states while redirecting
- Error handling for failed checkouts
- Success page with next steps

✅ **Testing:**
- All 6 test cases pass
- Webhook events processed correctly
- Email templates render properly
- Can authenticate with generated token

---

## Files to Create/Modify

**Create:**
- `scripts/stripe/create_mcp_products.sh`
- `scripts/stripe/setup_env_from_stripe.sh`
- `api/billing/checkout.py`
- `pages/dashboard/success.js`
- `api/email/templates/mcp_setup.html`
- `STRIPE_CHECKOUT_SETUP.md` (testing guide)

**Modify:**
- `components/PricingCard.js` (add checkout handler)
- `pages/index.js` (if needed)
- `pages/pricing.js` (if needed)
- `api/billing/stripe_webhooks.py` (add MCP integration)
- `.env.example` (add price IDs)
- `api/main.py` (register checkout routes)

**Total:** 6 new files + 6 modified files

---

## Risk Mitigation

**Risk:** Stripe products already exist
- **Mitigation:** Script checks before creating, uses existing if found

**Risk:** Webhook secret changes
- **Mitigation:** Document how to update from `stripe listen` output

**Risk:** Email sending fails
- **Mitigation:** Log token to database, user can retrieve from dashboard

**Risk:** Token generation fails
- **Mitigation:** Retry logic, manual token generation endpoint for support

**Risk:** User completes checkout but no token
- **Mitigation:** Webhook retries, manual token generation script

---

## Rollback Plan

If issues occur:
1. Disable checkout buttons (show "Coming Soon")
2. Process existing subscriptions manually
3. Generate tokens manually via script
4. Fix issues, re-enable

---

## Documentation Deliverables

1. **STRIPE_CHECKOUT_SETUP.md** - Complete setup guide for developers
2. **MCP_SUBSCRIPTION_USER_GUIDE.md** - Guide for subscribers
3. **TROUBLESHOOTING.md** - Common issues and fixes
4. **API_REFERENCE.md** - Update with checkout endpoints

---

## Next Steps After Implementation

**Week 1:**
- Monitor Stripe dashboard for subscriptions
- Track webhook success rate
- Monitor email delivery
- Gather user feedback

**Week 2:**
- Add customer portal for subscription management
- Implement invoice emails
- Add payment method updates
- Usage-based billing for overages

**Month 1:**
- Analyze conversion rates
- Optimize checkout flow
- Add promotional codes
- Implement annual billing option

---

## Questions for Clarification

Before starting implementation:

1. **Email Service:** What email provider? (SendGrid, AWS SES, Mailgun?)
2. **Test vs Live:** Start with test mode, or configure both?
3. **User Accounts:** Required before checkout, or create during checkout?
4. **Annual Billing:** Add annual options now, or later?
5. **Free Trial:** Offer trial period, or immediate paid subscription?

---

## Estimated Time

**Stripe CLI Setup:** 1 hour
**Backend API:** 2 hours
**Frontend Integration:** 2 hours
**Webhook Integration:** 2 hours
**Email Templates:** 1 hour
**Testing:** 2 hours

**Total:** ~10 hours (1.5 days with testing)

---

## Status

**Plan Status:** ✅ COMPLETE
**Ready for Execution:** YES
**Orchestrator:** Opus 4.1
**Agents:** Sonnet 4.5 with extended thinking

---

**Next Step:** Launch Sonnet 4.5 agents to implement this plan.
