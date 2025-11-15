# -*- coding: utf-8 -*-
"""
Telegram Bot for Kamiyo Exploit Alerts
Provides real-time exploit notifications via Telegram
"""

import os
import logging
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters
)
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


class KamiyoTelegramBot:
    """Telegram bot for Kamiyo exploit alerts"""

    def __init__(self, token: str, database_url: str):
        """Initialize Telegram bot"""
        self.token = token
        self.database_url = database_url
        self.application = None
        self.running = False

    def get_db_connection(self):
        """Get database connection"""
        return psycopg2.connect(self.database_url, cursor_factory=RealDictCursor)

    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command"""
        chat_id = update.effective_chat.id
        username = update.effective_user.username
        first_name = update.effective_user.first_name
        last_name = update.effective_user.last_name

        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()

            # Create or update user
            cursor.execute("""
                INSERT INTO telegram_users (chat_id, username, first_name, last_name, is_active, last_interaction)
                VALUES (%s, %s, %s, %s, TRUE, CURRENT_TIMESTAMP)
                ON CONFLICT (chat_id)
                DO UPDATE SET
                    username = EXCLUDED.username,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    is_active = TRUE,
                    is_blocked = FALSE,
                    last_interaction = CURRENT_TIMESTAMP
            """, (chat_id, username, first_name, last_name))

            # Create default subscription if doesn't exist
            cursor.execute("""
                INSERT INTO telegram_subscriptions (chat_id, is_active)
                VALUES (%s, TRUE)
                ON CONFLICT DO NOTHING
            """, (chat_id,))

            # Log command
            cursor.execute("""
                INSERT INTO telegram_commands (chat_id, command, success)
                VALUES (%s, 'start', TRUE)
            """, (chat_id,))

            conn.commit()
            cursor.close()
            conn.close()

            # Send welcome message
            welcome_msg = (
                "Welcome to Kamiyo Exploit Intelligence Bot!\n\n"
                "I'll keep you updated on cryptocurrency exploits in real-time.\n\n"
                "Available commands:\n"
                "/subscribe - Start receiving exploit alerts\n"
                "/unsubscribe - Stop receiving alerts\n"
                "/filter - Set your alert filters (chain, amount, protocol)\n"
                "/status - Check your subscription status\n"
                "/help - Show this help message\n\n"
                "By default, you'll receive alerts for exploits over $100,000 on all chains."
            )

            await update.message.reply_text(welcome_msg)

        except Exception as e:
            logger.error(f"Error in start command: {e}")
            await update.message.reply_text("Sorry, an error occurred. Please try again later.")

    async def subscribe_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /subscribe command"""
        chat_id = update.effective_chat.id

        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()

            # Activate subscription
            cursor.execute("""
                UPDATE telegram_subscriptions
                SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE chat_id = %s
            """, (chat_id,))

            # Update user status
            cursor.execute("""
                UPDATE telegram_users
                SET is_active = TRUE, last_interaction = CURRENT_TIMESTAMP
                WHERE chat_id = %s
            """, (chat_id,))

            # Log command
            cursor.execute("""
                INSERT INTO telegram_commands (chat_id, command, success)
                VALUES (%s, 'subscribe', TRUE)
            """, (chat_id,))

            conn.commit()
            cursor.close()
            conn.close()

            await update.message.reply_text(
                "You're now subscribed to exploit alerts!\n\n"
                "Use /filter to customize which alerts you receive."
            )

        except Exception as e:
            logger.error(f"Error in subscribe command: {e}")
            await update.message.reply_text("Sorry, an error occurred. Please try again later.")

    async def unsubscribe_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /unsubscribe command"""
        chat_id = update.effective_chat.id

        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()

            # Deactivate subscription
            cursor.execute("""
                UPDATE telegram_subscriptions
                SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE chat_id = %s
            """, (chat_id,))

            # Log command
            cursor.execute("""
                INSERT INTO telegram_commands (chat_id, command, success)
                VALUES (%s, 'unsubscribe', TRUE)
            """, (chat_id,))

            conn.commit()
            cursor.close()
            conn.close()

            await update.message.reply_text(
                "You've been unsubscribed from exploit alerts.\n\n"
                "Use /subscribe to re-enable alerts anytime."
            )

        except Exception as e:
            logger.error(f"Error in unsubscribe command: {e}")
            await update.message.reply_text("Sorry, an error occurred. Please try again later.")

    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command"""
        chat_id = update.effective_chat.id

        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()

            # Get user and subscription info
            cursor.execute("""
                SELECT
                    tu.tier,
                    tu.is_active as user_active,
                    ts.is_active as sub_active,
                    ts.chains,
                    ts.min_amount_usd,
                    ts.protocols,
                    ts.max_alerts_per_day,
                    COALESCE(trl.alert_count, 0) as alerts_today
                FROM telegram_users tu
                LEFT JOIN telegram_subscriptions ts ON tu.chat_id = ts.chat_id
                LEFT JOIN telegram_rate_limits trl ON tu.chat_id = trl.chat_id AND trl.date = CURRENT_DATE
                WHERE tu.chat_id = %s
            """, (chat_id,))

            result = cursor.fetchone()

            # Get total alerts sent
            cursor.execute("""
                SELECT COUNT(*) as total_alerts
                FROM telegram_alerts
                WHERE chat_id = %s
            """, (chat_id,))

            total_alerts = cursor.fetchone()['total_alerts']

            # Log command
            cursor.execute("""
                INSERT INTO telegram_commands (chat_id, command, success)
                VALUES (%s, 'status', TRUE)
            """, (chat_id,))

            conn.commit()
            cursor.close()
            conn.close()

            if result:
                status_msg = f"**Your Subscription Status**\n\n"
                status_msg += f"Tier: {result['tier'].title()}\n"
                status_msg += f"Status: {'Active' if result['sub_active'] else 'Inactive'}\n\n"

                status_msg += "**Filters:**\n"
                status_msg += f"Chains: {', '.join(result['chains']) if result['chains'] else 'All chains'}\n"
                status_msg += f"Min Amount: ${result['min_amount_usd']:,.0f}\n"
                status_msg += f"Protocols: {', '.join(result['protocols']) if result['protocols'] else 'All protocols'}\n\n"

                status_msg += "**Usage:**\n"
                status_msg += f"Alerts today: {result['alerts_today']}/{result['max_alerts_per_day']}\n"
                status_msg += f"Total alerts received: {total_alerts}\n"

                await update.message.reply_text(status_msg)
            else:
                await update.message.reply_text("No subscription found. Use /start to get started.")

        except Exception as e:
            logger.error(f"Error in status command: {e}")
            await update.message.reply_text("Sorry, an error occurred. Please try again later.")

    async def filter_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /filter command"""
        chat_id = update.effective_chat.id

        # Create inline keyboard for filter options
        keyboard = [
            [InlineKeyboardButton("Set Chains", callback_data='filter_chains')],
            [InlineKeyboardButton("Set Min Amount", callback_data='filter_amount')],
            [InlineKeyboardButton("Set Protocols", callback_data='filter_protocols')],
            [InlineKeyboardButton("Reset to Defaults", callback_data='filter_reset')],
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)

        await update.message.reply_text(
            "Configure your alert filters:\n\n"
            "Choose what you want to customize:",
            reply_markup=reply_markup
        )

    async def filter_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle filter callback buttons"""
        query = update.callback_query
        await query.answer()

        chat_id = query.message.chat_id
        action = query.data

        if action == 'filter_chains':
            # Show chain selection
            keyboard = [
                [InlineKeyboardButton("Ethereum", callback_data='chain_ethereum')],
                [InlineKeyboardButton("BSC", callback_data='chain_bsc')],
                [InlineKeyboardButton("Polygon", callback_data='chain_polygon')],
                [InlineKeyboardButton("Arbitrum", callback_data='chain_arbitrum')],
                [InlineKeyboardButton("All Chains", callback_data='chain_all')],
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text("Select chains to monitor:", reply_markup=reply_markup)

        elif action == 'filter_amount':
            await query.edit_message_text(
                "To set minimum amount, send a message like:\n"
                "/setamount 100000\n\n"
                "This will only alert you for exploits over $100,000."
            )

        elif action == 'filter_protocols':
            await query.edit_message_text(
                "To filter by protocols, send a message like:\n"
                "/setprotocols Uniswap,Aave,Compound\n\n"
                "Separate multiple protocols with commas."
            )

        elif action == 'filter_reset':
            try:
                conn = self.get_db_connection()
                cursor = conn.cursor()

                cursor.execute("""
                    UPDATE telegram_subscriptions
                    SET chains = NULL,
                        min_amount_usd = 0,
                        protocols = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE chat_id = %s
                """, (chat_id,))

                conn.commit()
                cursor.close()
                conn.close()

                await query.edit_message_text("Filters reset to defaults. You'll receive all alerts.")

            except Exception as e:
                logger.error(f"Error resetting filters: {e}")
                await query.edit_message_text("Error resetting filters. Please try again.")

        elif action.startswith('chain_'):
            chain = action.replace('chain_', '')
            try:
                conn = self.get_db_connection()
                cursor = conn.cursor()

                if chain == 'all':
                    cursor.execute("""
                        UPDATE telegram_subscriptions
                        SET chains = NULL, updated_at = CURRENT_TIMESTAMP
                        WHERE chat_id = %s
                    """, (chat_id,))
                    msg = "Now monitoring all chains."
                else:
                    cursor.execute("""
                        UPDATE telegram_subscriptions
                        SET chains = ARRAY[%s], updated_at = CURRENT_TIMESTAMP
                        WHERE chat_id = %s
                    """, (chain.title(), chat_id))
                    msg = f"Now monitoring {chain.title()} chain only."

                conn.commit()
                cursor.close()
                conn.close()

                await query.edit_message_text(msg)

            except Exception as e:
                logger.error(f"Error setting chain filter: {e}")
                await query.edit_message_text("Error updating filter. Please try again.")

    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command"""
        help_msg = (
            "**Kamiyo Exploit Intelligence Bot**\n\n"
            "**Commands:**\n"
            "/start - Initialize your subscription\n"
            "/subscribe - Enable exploit alerts\n"
            "/unsubscribe - Disable alerts\n"
            "/filter - Configure alert filters\n"
            "/status - View subscription details\n"
            "/help - Show this help message\n\n"
            "**Subscription Tiers:**\n"
            "Free: 5 alerts/day\n"
            "Basic: 20 alerts/day\n"
            "Pro: Unlimited alerts\n"
            "Enterprise: Unlimited alerts + priority support\n\n"
            "Link your account at https://kamiyo.ai to upgrade."
        )

        await update.message.reply_text(help_msg)

    async def send_exploit_alert(
        self,
        chat_id: int,
        exploit: Dict[str, Any],
        subscription: Dict[str, Any]
    ) -> bool:
        """
        Send exploit alert to user
        Returns True if sent successfully, False otherwise
        """
        try:
            # Check rate limit
            conn = self.get_db_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT tier FROM telegram_users WHERE chat_id = %s
            """, (chat_id,))

            user = cursor.fetchone()
            if not user:
                return False

            # Check if under rate limit
            cursor.execute("""
                SELECT check_telegram_rate_limit(%s, %s)
            """, (chat_id, user['tier']))

            can_send = cursor.fetchone()['check_telegram_rate_limit']
            if not can_send:
                logger.warning(f"Rate limit exceeded for chat_id {chat_id}")
                cursor.close()
                conn.close()
                return False

            # Check if already sent this exploit
            cursor.execute("""
                SELECT id FROM telegram_alerts
                WHERE chat_id = %s AND exploit_id = %s
            """, (chat_id, exploit['id']))

            if cursor.fetchone():
                logger.debug(f"Already sent exploit {exploit['id']} to chat_id {chat_id}")
                cursor.close()
                conn.close()
                return False

            # Format alert message
            message = self._format_exploit_message(exploit, subscription)

            # Send message
            sent_message = await self.application.bot.send_message(
                chat_id=chat_id,
                text=message,
                parse_mode='Markdown',
                disable_web_page_preview=False
            )

            # Record alert
            cursor.execute("""
                INSERT INTO telegram_alerts (chat_id, exploit_id, message_id, alert_type, delivered)
                VALUES (%s, %s, %s, 'instant', TRUE)
            """, (chat_id, exploit['id'], sent_message.message_id))

            # Increment rate limit
            cursor.execute("""
                SELECT increment_telegram_rate_limit(%s)
            """, (chat_id,))

            conn.commit()
            cursor.close()
            conn.close()

            logger.info(f"Sent exploit alert {exploit['id']} to chat_id {chat_id}")
            return True

        except Exception as e:
            logger.error(f"Error sending alert to chat_id {chat_id}: {e}")

            # Record failed alert
            try:
                conn = self.get_db_connection()
                cursor = conn.cursor()

                cursor.execute("""
                    INSERT INTO telegram_alerts (chat_id, exploit_id, alert_type, delivered, error_message)
                    VALUES (%s, %s, 'instant', FALSE, %s)
                """, (chat_id, exploit['id'], str(e)))

                conn.commit()
                cursor.close()
                conn.close()
            except:
                pass

            return False

    def _format_exploit_message(self, exploit: Dict[str, Any], subscription: Dict[str, Any]) -> str:
        """Format exploit data into Telegram message"""
        msg = f"**EXPLOIT ALERT**\n\n"
        msg += f"**Protocol:** {exploit.get('protocol', 'Unknown')}\n"
        msg += f"**Chain:** {exploit.get('chain', 'Unknown')}\n"
        msg += f"**Amount:** ${exploit.get('amount_usd', 0):,.0f}\n"
        msg += f"**Category:** {exploit.get('category', 'Unknown')}\n"

        if exploit.get('timestamp'):
            msg += f"**Time:** {exploit['timestamp'].strftime('%Y-%m-%d %H:%M UTC')}\n"

        if subscription.get('include_tx_link') and exploit.get('tx_hash'):
            msg += f"\n**TX Hash:** `{exploit['tx_hash']}`\n"

        if subscription.get('include_analysis') and exploit.get('description'):
            msg += f"\n**Details:**\n{exploit['description'][:200]}...\n"

        if exploit.get('source_url'):
            msg += f"\n[View Full Report]({exploit['source_url']})"

        return msg

    async def broadcast_new_exploit(self, exploit: Dict[str, Any]):
        """
        Broadcast new exploit to all matching subscriptions
        Called by the main aggregation system
        """
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()

            # Find matching subscriptions
            query = """
                SELECT ts.*, tu.chat_id, tu.tier
                FROM telegram_subscriptions ts
                JOIN telegram_users tu ON ts.chat_id = tu.chat_id
                WHERE ts.is_active = TRUE
                  AND tu.is_active = TRUE
                  AND tu.is_blocked = FALSE
                  AND ts.min_amount_usd <= %s
                  AND (ts.chains IS NULL OR %s = ANY(ts.chains))
                  AND (ts.protocols IS NULL OR %s = ANY(ts.protocols))
            """

            cursor.execute(query, (
                exploit.get('amount_usd', 0),
                exploit.get('chain'),
                exploit.get('protocol')
            ))

            subscriptions = cursor.fetchall()
            cursor.close()
            conn.close()

            logger.info(f"Broadcasting exploit {exploit['id']} to {len(subscriptions)} subscribers")

            # Send alerts
            sent_count = 0
            for sub in subscriptions:
                success = await self.send_exploit_alert(sub['chat_id'], exploit, sub)
                if success:
                    sent_count += 1

            logger.info(f"Successfully sent {sent_count}/{len(subscriptions)} alerts")

        except Exception as e:
            logger.error(f"Error broadcasting exploit: {e}")

    async def start(self):
        """Start the Telegram bot"""
        logger.info("Starting Kamiyo Telegram Bot...")

        # Create application
        self.application = Application.builder().token(self.token).build()

        # Register command handlers
        self.application.add_handler(CommandHandler("start", self.start_command))
        self.application.add_handler(CommandHandler("subscribe", self.subscribe_command))
        self.application.add_handler(CommandHandler("unsubscribe", self.unsubscribe_command))
        self.application.add_handler(CommandHandler("status", self.status_command))
        self.application.add_handler(CommandHandler("filter", self.filter_command))
        self.application.add_handler(CommandHandler("help", self.help_command))

        # Register callback handlers
        self.application.add_handler(CallbackQueryHandler(self.filter_callback))

        # Start bot
        self.running = True
        await self.application.initialize()
        await self.application.start()
        await self.application.updater.start_polling()

        logger.info("Telegram Bot started successfully")

    async def stop(self):
        """Stop the Telegram bot"""
        logger.info("Stopping Telegram Bot...")
        self.running = False

        if self.application:
            await self.application.updater.stop()
            await self.application.stop()
            await self.application.shutdown()

        logger.info("Telegram Bot stopped")


async def main():
    """Main entry point for running bot standalone"""
    from dotenv import load_dotenv
    load_dotenv()

    token = os.getenv('TELEGRAM_BOT_TOKEN')
    database_url = os.getenv('DATABASE_URL')

    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set in environment")
        return

    if not database_url:
        logger.error("DATABASE_URL not set in environment")
        return

    bot = KamiyoTelegramBot(token, database_url)

    try:
        await bot.start()
        # Keep running until interrupted
        while bot.running:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        await bot.stop()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    asyncio.run(main())
