# -*- coding: utf-8 -*-
"""
Visualization Generator for Exploit Analysis
Generates charts, graphs, and infographics for social media posts

Uses Pillow (PIL) for image generation with KAMIYO brand colors
"""

import os
import sys
from typing import List, Tuple, Optional, Dict
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont, ImageColor
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logger = logging.getLogger(__name__)


class VisualizationGenerator:
    """
    Generate visual assets for exploit analysis posts

    Creates branded charts, infographics, and social media cards
    following KAMIYO brand guidelines.
    """

    # KAMIYO Brand Colors (from BRAND_IDENTITY.md)
    COLORS = {
        'void': '#0A0A0B',           # Background black
        'obsidian': '#141417',       # Secondary black
        'shadow': '#1A1A1F',         # Tertiary black
        'amaterasu': '#4fe9ea',      # Cyan accent
        'takemikazuchi': '#ff44f5',  # Magenta accent
        'susano': '#6366F1',         # Indigo accent
        'exploit_critical': '#FF0844',  # Red
        'exploit_high': '#F97316',      # Orange
        'exploit_medium': '#EAB308',    # Yellow
        'exploit_low': '#22C55E',       # Green
        'text_primary': '#FFFFFF',      # White
        'text_secondary': '#A1A1AA',    # Gray
        'text_muted': '#71717A',        # Muted gray
        'border': '#27272A',            # Border gray
    }

    def __init__(self, output_dir: str = None):
        """
        Initialize visualization generator

        Args:
            output_dir: Directory to save generated images (defaults to ./visualizations/)
        """
        self.output_dir = output_dir or os.path.join(
            os.path.dirname(__file__),
            'visualizations'
        )
        os.makedirs(self.output_dir, exist_ok=True)

        # Try to load fonts
        self.font_title = self._load_font(size=48)
        self.font_body = self._load_font(size=24)
        self.font_small = self._load_font(size=18)

        logger.info(f"VisualizationGenerator initialized. Output: {self.output_dir}")

    def _load_font(self, size: int) -> ImageFont.FreeTypeFont:
        """Load font with fallback to default"""
        font_paths = [
            '/System/Library/Fonts/Supplemental/Arial.ttf',  # macOS
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # Linux
            'C:\\Windows\\Fonts\\arial.ttf',  # Windows
        ]

        for path in font_paths:
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except:
                    pass

        # Fallback to default
        return ImageFont.load_default()

    def _hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """Convert hex color to RGB tuple"""
        return ImageColor.getrgb(hex_color)

    def generate_exploit_card(
        self,
        protocol: str,
        chain: str,
        loss_amount: float,
        exploit_type: str,
        severity: str = 'high',
        timestamp: Optional[datetime] = None
    ) -> str:
        """
        Generate social media card for exploit

        Args:
            protocol: Protocol name
            chain: Blockchain name
            loss_amount: Loss in USD
            exploit_type: Type of exploit
            severity: Severity level (critical, high, medium, low)
            timestamp: When exploit occurred

        Returns:
            Path to generated image
        """
        # Image dimensions (Twitter/X optimal: 1200x675)
        width, height = 1200, 675
        img = Image.new('RGB', (width, height), self._hex_to_rgb(self.COLORS['void']))
        draw = ImageDraw.Draw(img)

        # Severity color
        severity_colors = {
            'critical': self.COLORS['exploit_critical'],
            'high': self.COLORS['exploit_high'],
            'medium': self.COLORS['exploit_medium'],
            'low': self.COLORS['exploit_low']
        }
        severity_color = severity_colors.get(severity.lower(), self.COLORS['exploit_high'])

        # Draw accent bar (top)
        draw.rectangle([(0, 0), (width, 10)], fill=self._hex_to_rgb(severity_color))

        # Draw severity indicator
        severity_text = severity.upper()
        severity_box = [(40, 50), (200, 100)]
        draw.rectangle(severity_box, fill=self._hex_to_rgb(severity_color))
        draw.text((120, 75), severity_text, fill=self._hex_to_rgb(self.COLORS['text_primary']),
                  font=self.font_small, anchor='mm')

        # Draw protocol name
        draw.text((40, 150), protocol, fill=self._hex_to_rgb(self.COLORS['text_primary']),
                  font=self.font_title)

        # Draw loss amount
        amount_text = f"${loss_amount:,.0f}" if loss_amount >= 1000 else f"${loss_amount:.2f}"
        if loss_amount >= 1_000_000:
            amount_text = f"${loss_amount/1_000_000:.1f}M"
        draw.text((40, 230), amount_text, fill=self._hex_to_rgb(severity_color),
                  font=self.font_title)

        # Draw details
        y_offset = 320
        details = [
            f"Chain: {chain}",
            f"Attack: {exploit_type}",
        ]
        if timestamp:
            details.append(f"Time: {timestamp.strftime('%Y-%m-%d %H:%M UTC')}")

        for detail in details:
            draw.text((40, y_offset), detail, fill=self._hex_to_rgb(self.COLORS['text_secondary']),
                      font=self.font_body)
            y_offset += 40

        # Draw KAMIYO branding (bottom right)
        draw.text((width - 40, height - 40), "KAMIYO",
                  fill=self._hex_to_rgb(self.COLORS['amaterasu']),
                  font=self.font_body, anchor='rs')
        draw.text((width - 40, height - 70), "Intelligence Platform",
                  fill=self._hex_to_rgb(self.COLORS['text_muted']),
                  font=self.font_small, anchor='rs')

        # Save image
        filename = f"exploit_{protocol.replace(' ', '_')}_{int(datetime.utcnow().timestamp())}.png"
        filepath = os.path.join(self.output_dir, filename)
        img.save(filepath, 'PNG', quality=95)

        logger.info(f"Generated exploit card: {filepath}")
        return filepath

    def generate_timeline_chart(
        self,
        events: List[Dict],
        title: str = "Exploit Timeline"
    ) -> str:
        """
        Generate timeline visualization

        Args:
            events: List of {time: str, description: str}
            title: Chart title

        Returns:
            Path to generated image
        """
        width, height = 1200, 800
        img = Image.new('RGB', (width, height), self._hex_to_rgb(self.COLORS['void']))
        draw = ImageDraw.Draw(img)

        # Draw title
        draw.text((40, 40), title, fill=self._hex_to_rgb(self.COLORS['text_primary']),
                  font=self.font_title)

        # Draw timeline
        timeline_y = 150
        line_color = self._hex_to_rgb(self.COLORS['amaterasu'])
        draw.line([(100, timeline_y), (width - 100, timeline_y)], fill=line_color, width=4)

        # Draw events
        event_spacing = (width - 200) // max(len(events), 1)
        for i, event in enumerate(events[:5]):  # Max 5 events
            x = 100 + (i * event_spacing)

            # Draw event dot
            draw.ellipse([(x-15, timeline_y-15), (x+15, timeline_y+15)],
                         fill=line_color)

            # Draw time
            draw.text((x, timeline_y - 60), event.get('time', ''),
                      fill=self._hex_to_rgb(self.COLORS['text_secondary']),
                      font=self.font_small, anchor='mm')

            # Draw description (wrapped)
            desc = event.get('description', '')[:50]
            draw.text((x, timeline_y + 60), desc,
                      fill=self._hex_to_rgb(self.COLORS['text_muted']),
                      font=self.font_small, anchor='mt')

        # Draw KAMIYO branding
        draw.text((width - 40, height - 40), "KAMIYO",
                  fill=self._hex_to_rgb(self.COLORS['amaterasu']),
                  font=self.font_body, anchor='rs')

        # Save
        filename = f"timeline_{int(datetime.utcnow().timestamp())}.png"
        filepath = os.path.join(self.output_dir, filename)
        img.save(filepath, 'PNG', quality=95)

        logger.info(f"Generated timeline chart: {filepath}")
        return filepath

    def generate_bar_chart(
        self,
        data: List[Tuple[str, float]],
        title: str,
        y_label: str = "Loss (USD)",
        color: str = None
    ) -> str:
        """
        Generate bar chart

        Args:
            data: List of (label, value) tuples
            title: Chart title
            y_label: Y-axis label
            color: Bar color (defaults to amaterasu)

        Returns:
            Path to generated image
        """
        width, height = 1200, 800
        img = Image.new('RGB', (width, height), self._hex_to_rgb(self.COLORS['void']))
        draw = ImageDraw.Draw(img)

        # Draw title
        draw.text((40, 40), title, fill=self._hex_to_rgb(self.COLORS['text_primary']),
                  font=self.font_title)

        # Chart area
        chart_left, chart_top = 100, 150
        chart_right, chart_bottom = width - 100, height - 150

        # Find max value
        max_value = max(value for _, value in data) if data else 1
        bar_width = (chart_right - chart_left) // len(data) - 20

        # Bar color
        bar_color = self._hex_to_rgb(color or self.COLORS['amaterasu'])

        # Draw bars
        for i, (label, value) in enumerate(data):
            x = chart_left + (i * (bar_width + 20))
            bar_height = (value / max_value) * (chart_bottom - chart_top)
            y = chart_bottom - bar_height

            # Draw bar
            draw.rectangle([(x, y), (x + bar_width, chart_bottom)],
                           fill=bar_color)

            # Draw value
            value_text = f"${value/1_000_000:.1f}M" if value >= 1_000_000 else f"${value/1000:.0f}K"
            draw.text((x + bar_width//2, y - 10), value_text,
                      fill=self._hex_to_rgb(self.COLORS['text_secondary']),
                      font=self.font_small, anchor='mb')

            # Draw label
            label_text = label[:15]  # Truncate long labels
            draw.text((x + bar_width//2, chart_bottom + 20), label_text,
                      fill=self._hex_to_rgb(self.COLORS['text_muted']),
                      font=self.font_small, anchor='mt')

        # Draw Y-axis label
        draw.text((20, chart_top + (chart_bottom - chart_top)//2), y_label,
                  fill=self._hex_to_rgb(self.COLORS['text_muted']),
                  font=self.font_body, anchor='lm')

        # Draw KAMIYO branding
        draw.text((width - 40, height - 40), "KAMIYO",
                  fill=self._hex_to_rgb(self.COLORS['amaterasu']),
                  font=self.font_body, anchor='rs')

        # Save
        filename = f"chart_{int(datetime.utcnow().timestamp())}.png"
        filepath = os.path.join(self.output_dir, filename)
        img.save(filepath, 'PNG', quality=95)

        logger.info(f"Generated bar chart: {filepath}")
        return filepath


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("=" * 80)
    print("KAMIYO Visualization Generator - Example")
    print("=" * 80)

    generator = VisualizationGenerator()

    # Generate exploit card
    print("\n1. Generating exploit card...")
    card_path = generator.generate_exploit_card(
        protocol="Curve Finance",
        chain="Ethereum",
        loss_amount=15_000_000,
        exploit_type="Reentrancy",
        severity="critical",
        timestamp=datetime.utcnow()
    )
    print(f"✅ Saved: {card_path}")

    # Generate timeline
    print("\n2. Generating timeline...")
    timeline_path = generator.generate_timeline_chart(
        events=[
            {'time': '10:00 UTC', 'description': 'Attack executed'},
            {'time': '10:05 UTC', 'description': 'Reported by Rekt News'},
            {'time': '10:15 UTC', 'description': 'Detected by KAMIYO'},
            {'time': '11:00 UTC', 'description': 'Recovery initiated'},
        ],
        title="Curve Finance Exploit Timeline"
    )
    print(f"✅ Saved: {timeline_path}")

    # Generate bar chart
    print("\n3. Generating bar chart...")
    chart_path = generator.generate_bar_chart(
        data=[
            ('Q1 2024', 500_000_000),
            ('Q2 2024', 750_000_000),
            ('Q3 2024', 450_000_000),
            ('Q4 2024', 900_000_000),
        ],
        title="DeFi Exploit Losses by Quarter",
        y_label="Total Loss (USD)"
    )
    print(f"✅ Saved: {chart_path}")

    print("\n" + "=" * 80)
    print("Visualization generation complete!")
    print(f"Check: {generator.output_dir}")
    print("=" * 80)
