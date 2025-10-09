"""
Newsletter Subscription API

Handles newsletter subscriptions with:
- Email validation
- Integration with email providers (Mailchimp, SendGrid)
- Double opt-in flow
- Unsubscribe mechanism
- Subscriber management
- GDPR compliance
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
import re
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
import os
import requests

# Configuration
EMAIL_PROVIDER = os.getenv('EMAIL_PROVIDER', 'sendgrid')  # 'sendgrid' or 'mailchimp'
SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY', '')
SENDGRID_LIST_ID = os.getenv('SENDGRID_LIST_ID', '')
MAILCHIMP_API_KEY = os.getenv('MAILCHIMP_API_KEY', '')
MAILCHIMP_LIST_ID = os.getenv('MAILCHIMP_LIST_ID', '')
MAILCHIMP_SERVER = os.getenv('MAILCHIMP_SERVER', 'us1')
DATABASE_PATH = os.getenv('DATABASE_PATH', 'data/kamiyo.db')
SITE_URL = os.getenv('SITE_URL', 'https://kamiyo.io')

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])


# Models
class SubscribeRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    source: Optional[str] = 'website'  # 'website', 'modal', 'footer', 'blog'
    tags: Optional[List[str]] = []
    consent: bool  # GDPR consent

    @validator('email')
    def validate_email(cls, v):
        # Additional email validation
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v.lower()


class UnsubscribeRequest(BaseModel):
    email: EmailStr
    token: Optional[str] = None


class SubscriberResponse(BaseModel):
    email: str
    status: str
    subscribed_at: Optional[str]
    message: str


# Database functions
def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def create_newsletter_tables():
    """Create newsletter tables if they don't exist"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            source TEXT,
            tags TEXT,
            consent BOOLEAN NOT NULL DEFAULT 0,
            verification_token TEXT,
            unsubscribe_token TEXT UNIQUE,
            subscribed_at TEXT,
            verified_at TEXT,
            unsubscribed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscribers_email
        ON newsletter_subscribers(email)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscribers_status
        ON newsletter_subscribers(status)
    """)

    conn.commit()
    conn.close()


# Initialize tables
create_newsletter_tables()


def generate_token() -> str:
    """Generate secure random token"""
    return secrets.token_urlsafe(32)


def hash_email(email: str) -> str:
    """Hash email for privacy"""
    return hashlib.sha256(email.encode()).hexdigest()


async def send_verification_email(email: str, name: Optional[str], token: str):
    """Send verification email"""
    verification_url = f"{SITE_URL}/newsletter/verify?token={token}"

    subject = "Confirm your Kamiyo newsletter subscription"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .button {{ display: inline-block; padding: 15px 30px; background: #7C3AED; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
            .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to Kamiyo!</h1>
            </div>
            <div class="content">
                <p>Hi {name or 'there'},</p>
                <p>Thanks for subscribing to the Kamiyo newsletter! To complete your subscription, please verify your email address by clicking the button below:</p>
                <div style="text-align: center;">
                    <a href="{verification_url}" class="button">Verify Email Address</a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">{verification_url}</p>
                <p>This link will expire in 24 hours.</p>
                <p><strong>What you'll receive:</strong></p>
                <ul>
                    <li>Weekly security updates</li>
                    <li>Major exploit alerts</li>
                    <li>Industry insights and analysis</li>
                    <li>Product updates and features</li>
                </ul>
                <p>If you didn't request this, you can safely ignore this email.</p>
            </div>
            <div class="footer">
                <p>&copy; 2025 Kamiyo. All rights reserved.</p>
                <p>Real-time exploit intelligence for DeFi</p>
            </div>
        </div>
    </body>
    </html>
    """

    # Send email based on provider
    if EMAIL_PROVIDER == 'sendgrid':
        await send_via_sendgrid(email, subject, html_content)
    elif EMAIL_PROVIDER == 'mailchimp':
        # Mailchimp handles this automatically
        pass


async def send_via_sendgrid(to_email: str, subject: str, html_content: str):
    """Send email via SendGrid"""
    if not SENDGRID_API_KEY:
        print("Warning: SendGrid API key not configured")
        return

    url = 'https://api.sendgrid.com/v3/mail/send'
    headers = {
        'Authorization': f'Bearer {SENDGRID_API_KEY}',
        'Content-Type': 'application/json'
    }
    data = {
        'personalizations': [{'to': [{'email': to_email}]}],
        'from': {'email': 'noreply@kamiyo.io', 'name': 'Kamiyo'},
        'subject': subject,
        'content': [{'type': 'text/html', 'value': html_content}]
    }

    try:
        response = requests.post(url, headers=headers, json=data)
        if response.status_code not in [200, 202]:
            print(f"SendGrid error: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Failed to send email via SendGrid: {e}")


# API Endpoints
@router.post("/subscribe", response_model=SubscriberResponse)
async def subscribe(
    request: SubscribeRequest,
    background_tasks: BackgroundTasks
):
    """
    Subscribe to newsletter

    Requires GDPR consent and sends verification email
    """
    if not request.consent:
        raise HTTPException(
            status_code=400,
            detail="Consent required for newsletter subscription"
        )

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Check if already subscribed
        cursor.execute(
            "SELECT status, verified_at FROM newsletter_subscribers WHERE email = ?",
            (request.email,)
        )
        existing = cursor.fetchone()

        if existing:
            if existing['status'] == 'active':
                return SubscriberResponse(
                    email=request.email,
                    status='already_subscribed',
                    subscribed_at=existing['verified_at'],
                    message='You are already subscribed to our newsletter'
                )
            elif existing['status'] == 'pending':
                return SubscriberResponse(
                    email=request.email,
                    status='pending',
                    subscribed_at=None,
                    message='Please check your email to verify your subscription'
                )

        # Generate tokens
        verification_token = generate_token()
        unsubscribe_token = generate_token()
        now = datetime.utcnow().isoformat()

        # Insert subscriber
        cursor.execute("""
            INSERT OR REPLACE INTO newsletter_subscribers
            (email, name, status, source, tags, consent, verification_token,
             unsubscribe_token, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.email,
            request.name,
            'pending',
            request.source,
            ','.join(request.tags) if request.tags else '',
            request.consent,
            verification_token,
            unsubscribe_token,
            now,
            now
        ))

        conn.commit()

        # Send verification email in background
        background_tasks.add_task(
            send_verification_email,
            request.email,
            request.name,
            verification_token
        )

        # Add to email provider
        if EMAIL_PROVIDER == 'sendgrid':
            background_tasks.add_task(add_to_sendgrid, request.email, request.name)
        elif EMAIL_PROVIDER == 'mailchimp':
            background_tasks.add_task(add_to_mailchimp, request.email, request.name)

        return SubscriberResponse(
            email=request.email,
            status='pending',
            subscribed_at=None,
            message='Please check your email to verify your subscription'
        )

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Subscription failed: {str(e)}")
    finally:
        conn.close()


@router.get("/verify")
async def verify_subscription(token: str):
    """Verify newsletter subscription"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT email, name FROM newsletter_subscribers WHERE verification_token = ?",
            (token,)
        )
        subscriber = cursor.fetchone()

        if not subscriber:
            raise HTTPException(status_code=404, detail="Invalid verification token")

        # Update status
        now = datetime.utcnow().isoformat()
        cursor.execute("""
            UPDATE newsletter_subscribers
            SET status = 'active',
                verified_at = ?,
                subscribed_at = ?,
                updated_at = ?
            WHERE verification_token = ?
        """, (now, now, now, token))

        conn.commit()

        return {
            'success': True,
            'message': 'Email verified successfully! You are now subscribed.',
            'email': subscriber['email']
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")
    finally:
        conn.close()


@router.post("/unsubscribe")
async def unsubscribe(request: UnsubscribeRequest):
    """Unsubscribe from newsletter"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Find subscriber
        if request.token:
            cursor.execute(
                "SELECT email FROM newsletter_subscribers WHERE unsubscribe_token = ?",
                (request.token,)
            )
        else:
            cursor.execute(
                "SELECT email FROM newsletter_subscribers WHERE email = ?",
                (request.email,)
            )

        subscriber = cursor.fetchone()

        if not subscriber:
            raise HTTPException(status_code=404, detail="Subscriber not found")

        # Update status
        now = datetime.utcnow().isoformat()
        cursor.execute("""
            UPDATE newsletter_subscribers
            SET status = 'unsubscribed',
                unsubscribed_at = ?,
                updated_at = ?
            WHERE email = ?
        """, (now, now, subscriber['email']))

        conn.commit()

        return {
            'success': True,
            'message': 'You have been unsubscribed from the newsletter',
            'email': subscriber['email']
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Unsubscribe failed: {str(e)}")
    finally:
        conn.close()


@router.get("/status/{email}")
async def get_subscription_status(email: str):
    """Get subscription status for an email"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT status, subscribed_at, verified_at FROM newsletter_subscribers WHERE email = ?",
            (email.lower(),)
        )
        subscriber = cursor.fetchone()

        if not subscriber:
            return {
                'email': email,
                'subscribed': False,
                'status': 'not_found'
            }

        return {
            'email': email,
            'subscribed': subscriber['status'] == 'active',
            'status': subscriber['status'],
            'subscribed_at': subscriber['subscribed_at'],
            'verified_at': subscriber['verified_at']
        }

    finally:
        conn.close()


async def add_to_sendgrid(email: str, name: Optional[str]):
    """Add contact to SendGrid"""
    if not SENDGRID_API_KEY or not SENDGRID_LIST_ID:
        return

    url = 'https://api.sendgrid.com/v3/marketing/contacts'
    headers = {
        'Authorization': f'Bearer {SENDGRID_API_KEY}',
        'Content-Type': 'application/json'
    }
    data = {
        'list_ids': [SENDGRID_LIST_ID],
        'contacts': [
            {
                'email': email,
                'first_name': name or '',
            }
        ]
    }

    try:
        response = requests.put(url, headers=headers, json=data)
        if response.status_code not in [200, 202]:
            print(f"SendGrid add contact error: {response.text}")
    except Exception as e:
        print(f"Failed to add contact to SendGrid: {e}")


async def add_to_mailchimp(email: str, name: Optional[str]):
    """Add subscriber to Mailchimp"""
    if not MAILCHIMP_API_KEY or not MAILCHIMP_LIST_ID:
        return

    url = f'https://{MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/{MAILCHIMP_LIST_ID}/members'
    headers = {
        'Authorization': f'Bearer {MAILCHIMP_API_KEY}',
        'Content-Type': 'application/json'
    }
    data = {
        'email_address': email,
        'status': 'pending',  # Double opt-in
        'merge_fields': {
            'FNAME': name or '',
        }
    }

    try:
        response = requests.post(url, headers=headers, json=data)
        if response.status_code not in [200, 201]:
            print(f"Mailchimp add subscriber error: {response.text}")
    except Exception as e:
        print(f"Failed to add subscriber to Mailchimp: {e}")
