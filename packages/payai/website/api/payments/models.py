# -*- coding: utf-8 -*-
"""
Payment Database Models for Kamiyo
SQLAlchemy models for customers, subscriptions, and payments
"""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, validator


# ==========================================
# PYDANTIC REQUEST/RESPONSE MODELS
# ==========================================

class CreateCustomerRequest(BaseModel):
    """Request model for creating a Stripe customer"""

    email: str = Field(..., description="Customer email address")
    name: Optional[str] = Field(None, description="Customer name")
    metadata: Optional[Dict[str, str]] = Field(None, description="Additional metadata")

    @validator('email')
    def validate_email(cls, v):
        """Validate email format"""
        if '@' not in v or '.' not in v:
            raise ValueError('Invalid email address')
        return v.lower()


class CustomerResponse(BaseModel):
    """Response model for customer data"""

    id: int = Field(..., description="Database customer ID")
    stripe_customer_id: str = Field(..., description="Stripe customer ID")
    user_id: int = Field(..., description="Associated user ID")
    email: str = Field(..., description="Customer email")
    name: Optional[str] = Field(None, description="Customer name")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        orm_mode = True


class CreateSubscriptionRequest(BaseModel):
    """Request model for creating a subscription"""

    customer_id: int = Field(..., description="Database customer ID")
    price_id: str = Field(..., description="Stripe price ID")
    tier: str = Field(..., description="Subscription tier (basic, pro, enterprise)")
    metadata: Optional[Dict[str, str]] = Field(None, description="Additional metadata")

    @validator('tier')
    def validate_tier(cls, v):
        """Validate subscription tier"""
        valid_tiers = ['basic', 'pro', 'enterprise']
        if v.lower() not in valid_tiers:
            raise ValueError(f'Tier must be one of: {", ".join(valid_tiers)}')
        return v.lower()


class SubscriptionResponse(BaseModel):
    """Response model for subscription data"""

    id: int = Field(..., description="Database subscription ID")
    stripe_subscription_id: str = Field(..., description="Stripe subscription ID")
    customer_id: int = Field(..., description="Database customer ID")
    status: str = Field(..., description="Subscription status")
    tier: str = Field(..., description="Subscription tier")
    current_period_start: datetime = Field(..., description="Current billing period start")
    current_period_end: datetime = Field(..., description="Current billing period end")
    cancel_at_period_end: bool = Field(..., description="Whether subscription cancels at period end")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        orm_mode = True


class PaymentResponse(BaseModel):
    """Response model for payment data"""

    id: int = Field(..., description="Database payment ID")
    stripe_payment_id: str = Field(..., description="Stripe payment intent ID")
    customer_id: int = Field(..., description="Database customer ID")
    amount: float = Field(..., description="Payment amount")
    currency: str = Field(..., description="Payment currency")
    status: str = Field(..., description="Payment status")
    description: Optional[str] = Field(None, description="Payment description")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    created_at: datetime = Field(..., description="Creation timestamp")

    class Config:
        orm_mode = True


class PaymentMethodResponse(BaseModel):
    """Response model for payment method data"""

    id: int = Field(..., description="Database payment method ID")
    stripe_payment_method_id: str = Field(..., description="Stripe payment method ID")
    customer_id: int = Field(..., description="Database customer ID")
    type: str = Field(..., description="Payment method type (card, bank_account)")
    card_brand: Optional[str] = Field(None, description="Card brand (visa, mastercard, etc)")
    card_last4: Optional[str] = Field(None, description="Last 4 digits of card")
    card_exp_month: Optional[int] = Field(None, description="Card expiration month")
    card_exp_year: Optional[int] = Field(None, description="Card expiration year")
    is_default: bool = Field(..., description="Whether this is the default payment method")
    created_at: datetime = Field(..., description="Creation timestamp")

    class Config:
        orm_mode = True


class UpdateSubscriptionRequest(BaseModel):
    """Request model for updating a subscription"""

    price_id: Optional[str] = Field(None, description="New Stripe price ID")
    tier: Optional[str] = Field(None, description="New subscription tier")
    cancel_at_period_end: Optional[bool] = Field(None, description="Cancel at period end")
    metadata: Optional[Dict[str, str]] = Field(None, description="Additional metadata")

    @validator('tier')
    def validate_tier(cls, v):
        """Validate subscription tier"""
        if v is not None:
            valid_tiers = ['basic', 'pro', 'enterprise']
            if v.lower() not in valid_tiers:
                raise ValueError(f'Tier must be one of: {", ".join(valid_tiers)}')
            return v.lower()
        return v


class CancelSubscriptionRequest(BaseModel):
    """Request model for canceling a subscription"""

    cancel_immediately: bool = Field(
        False,
        description="Cancel immediately (True) or at period end (False)"
    )
    cancellation_reason: Optional[str] = Field(
        None,
        description="Reason for cancellation"
    )


# ==========================================
# DATABASE MODELS (Raw SQL representation)
# ==========================================

class CustomerDBModel:
    """
    Database model for customers table

    This is a reference model showing the table structure.
    Actual database operations use PostgresManager with raw SQL.
    """

    table_name = "customers"

    columns = {
        "id": "SERIAL PRIMARY KEY",
        "stripe_customer_id": "VARCHAR(255) UNIQUE NOT NULL",
        "user_id": "INTEGER NOT NULL",
        "email": "VARCHAR(255) NOT NULL",
        "name": "VARCHAR(255)",
        "metadata": "JSONB",
        "created_at": "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
        "updated_at": "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
    }

    indexes = [
        "CREATE INDEX idx_customers_stripe_id ON customers(stripe_customer_id)",
        "CREATE INDEX idx_customers_user_id ON customers(user_id)",
        "CREATE INDEX idx_customers_email ON customers(email)"
    ]


class SubscriptionDBModel:
    """
    Database model for subscriptions table

    This is a reference model showing the table structure.
    Actual database operations use PostgresManager with raw SQL.
    """

    table_name = "subscriptions"

    columns = {
        "id": "SERIAL PRIMARY KEY",
        "stripe_subscription_id": "VARCHAR(255) UNIQUE NOT NULL",
        "customer_id": "INTEGER NOT NULL",
        "status": "VARCHAR(50) NOT NULL",
        "tier": "VARCHAR(50) NOT NULL",
        "current_period_start": "TIMESTAMPTZ NOT NULL",
        "current_period_end": "TIMESTAMPTZ NOT NULL",
        "cancel_at_period_end": "BOOLEAN DEFAULT FALSE",
        "canceled_at": "TIMESTAMPTZ",
        "metadata": "JSONB",
        "created_at": "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
        "updated_at": "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
    }

    indexes = [
        "CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id)",
        "CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id)",
        "CREATE INDEX idx_subscriptions_status ON subscriptions(status)",
        "CREATE INDEX idx_subscriptions_tier ON subscriptions(tier)"
    ]

    foreign_keys = [
        "FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE"
    ]


class PaymentDBModel:
    """
    Database model for payments_history table

    This is a reference model showing the table structure.
    Actual database operations use PostgresManager with raw SQL.
    """

    table_name = "payments_history"

    columns = {
        "id": "SERIAL PRIMARY KEY",
        "stripe_payment_id": "VARCHAR(255) UNIQUE NOT NULL",
        "customer_id": "INTEGER NOT NULL",
        "amount": "DECIMAL(10, 2) NOT NULL",
        "currency": "VARCHAR(10) DEFAULT 'usd'",
        "status": "VARCHAR(50) NOT NULL",
        "description": "TEXT",
        "metadata": "JSONB",
        "created_at": "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
    }

    indexes = [
        "CREATE INDEX idx_payments_stripe_id ON payments_history(stripe_payment_id)",
        "CREATE INDEX idx_payments_customer_id ON payments_history(customer_id)",
        "CREATE INDEX idx_payments_status ON payments_history(status)",
        "CREATE INDEX idx_payments_created_at ON payments_history(created_at DESC)"
    ]

    foreign_keys = [
        "FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE"
    ]


class PaymentMethodDBModel:
    """
    Database model for payment_methods table

    This is a reference model showing the table structure.
    Actual database operations use PostgresManager with raw SQL.
    """

    table_name = "payment_methods"

    columns = {
        "id": "SERIAL PRIMARY KEY",
        "stripe_payment_method_id": "VARCHAR(255) UNIQUE NOT NULL",
        "customer_id": "INTEGER NOT NULL",
        "type": "VARCHAR(50) NOT NULL",
        "card_brand": "VARCHAR(50)",
        "card_last4": "VARCHAR(4)",
        "card_exp_month": "INTEGER",
        "card_exp_year": "INTEGER",
        "is_default": "BOOLEAN DEFAULT FALSE",
        "created_at": "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
    }

    indexes = [
        "CREATE INDEX idx_payment_methods_stripe_id ON payment_methods(stripe_payment_method_id)",
        "CREATE INDEX idx_payment_methods_customer_id ON payment_methods(customer_id)",
        "CREATE INDEX idx_payment_methods_is_default ON payment_methods(is_default)"
    ]

    foreign_keys = [
        "FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE"
    ]


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def serialize_customer(customer_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize customer data from database

    Args:
        customer_dict: Raw database row as dict

    Returns:
        Serialized customer data
    """

    return {
        'id': customer_dict['id'],
        'stripe_customer_id': customer_dict['stripe_customer_id'],
        'user_id': customer_dict['user_id'],
        'email': customer_dict['email'],
        'name': customer_dict.get('name'),
        'metadata': customer_dict.get('metadata') or {},
        'created_at': customer_dict['created_at'],
        'updated_at': customer_dict['updated_at']
    }


def serialize_subscription(subscription_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize subscription data from database

    Args:
        subscription_dict: Raw database row as dict

    Returns:
        Serialized subscription data
    """

    return {
        'id': subscription_dict['id'],
        'stripe_subscription_id': subscription_dict['stripe_subscription_id'],
        'customer_id': subscription_dict['customer_id'],
        'status': subscription_dict['status'],
        'tier': subscription_dict['tier'],
        'current_period_start': subscription_dict['current_period_start'],
        'current_period_end': subscription_dict['current_period_end'],
        'cancel_at_period_end': subscription_dict['cancel_at_period_end'],
        'metadata': subscription_dict.get('metadata') or {},
        'created_at': subscription_dict['created_at'],
        'updated_at': subscription_dict['updated_at']
    }


def serialize_payment(payment_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize payment data from database

    Args:
        payment_dict: Raw database row as dict

    Returns:
        Serialized payment data
    """

    return {
        'id': payment_dict['id'],
        'stripe_payment_id': payment_dict['stripe_payment_id'],
        'customer_id': payment_dict['customer_id'],
        'amount': float(payment_dict['amount']),
        'currency': payment_dict['currency'],
        'status': payment_dict['status'],
        'description': payment_dict.get('description'),
        'metadata': payment_dict.get('metadata') or {},
        'created_at': payment_dict['created_at']
    }


def serialize_payment_method(payment_method_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize payment method data from database

    Args:
        payment_method_dict: Raw database row as dict

    Returns:
        Serialized payment method data
    """

    return {
        'id': payment_method_dict['id'],
        'stripe_payment_method_id': payment_method_dict['stripe_payment_method_id'],
        'customer_id': payment_method_dict['customer_id'],
        'type': payment_method_dict['type'],
        'card_brand': payment_method_dict.get('card_brand'),
        'card_last4': payment_method_dict.get('card_last4'),
        'card_exp_month': payment_method_dict.get('card_exp_month'),
        'card_exp_year': payment_method_dict.get('card_exp_year'),
        'is_default': payment_method_dict['is_default'],
        'created_at': payment_method_dict['created_at']
    }
