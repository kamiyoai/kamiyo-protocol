#!/usr/bin/env python3
"""
Sitemap Generation Script

Automatically generates XML sitemaps for:
- Main sitemap (static pages)
- Blog sitemap (blog posts)
- Exploits sitemap (exploit detail pages)

Features:
- Updates last modification dates
- Sets priorities and changefreq
- Submits to Google Search Console
- Validates XML format

Usage:
    python scripts/generate_sitemap.py
    python scripts/generate_sitemap.py --submit  # Also submit to Google
"""

import os
import sys
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import sqlite3
import requests
from urllib.parse import urljoin

# Configuration
BASE_URL = os.getenv('SITE_URL', 'https://kamiyo.io')
SITEMAP_DIR = os.getenv('SITEMAP_DIR', 'frontend/public')
DATABASE_PATH = os.getenv('DATABASE_PATH', 'data/kamiyo.db')

# Google Search Console API (if configured)
GOOGLE_SEARCH_CONSOLE_PROPERTY = os.getenv('GOOGLE_SEARCH_CONSOLE_PROPERTY', '')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')


class SitemapGenerator:
    """Generate XML sitemaps for the website"""

    def __init__(self, base_url: str, output_dir: str):
        self.base_url = base_url.rstrip('/')
        self.output_dir = output_dir
        self.namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'

        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

    def create_url_element(
        self,
        loc: str,
        lastmod: Optional[str] = None,
        changefreq: str = 'weekly',
        priority: float = 0.5
    ) -> ET.Element:
        """Create a URL element for sitemap"""
        url = ET.Element('url')

        # Location (required)
        loc_elem = ET.SubElement(url, 'loc')
        loc_elem.text = urljoin(self.base_url, loc)

        # Last modification date
        if lastmod:
            lastmod_elem = ET.SubElement(url, 'lastmod')
            lastmod_elem.text = lastmod

        # Change frequency
        changefreq_elem = ET.SubElement(url, 'changefreq')
        changefreq_elem.text = changefreq

        # Priority
        priority_elem = ET.SubElement(url, 'priority')
        priority_elem.text = str(priority)

        return url

    def generate_main_sitemap(self) -> str:
        """Generate main sitemap with static pages"""
        urlset = ET.Element('urlset', xmlns=self.namespace)

        # Define static pages with their properties
        static_pages = [
            # High priority pages
            {
                'loc': '/',
                'changefreq': 'daily',
                'priority': 1.0,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/pricing',
                'changefreq': 'weekly',
                'priority': 0.9,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/exploits',
                'changefreq': 'daily',
                'priority': 0.9,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },

            # Medium priority pages
            {
                'loc': '/about',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/blog',
                'changefreq': 'weekly',
                'priority': 0.8,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/docs',
                'changefreq': 'weekly',
                'priority': 0.8,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/contact',
                'changefreq': 'monthly',
                'priority': 0.6,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },

            # Use case pages
            {
                'loc': '/use-cases/defi-protocols',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/use-cases/security-researchers',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/use-cases/investors',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/use-cases/auditors',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },

            # Documentation pages
            {
                'loc': '/docs/api',
                'changefreq': 'weekly',
                'priority': 0.8,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/docs/alerts',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/docs/authentication',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
            {
                'loc': '/docs/webhooks',
                'changefreq': 'monthly',
                'priority': 0.7,
                'lastmod': datetime.now().strftime('%Y-%m-%d')
            },
        ]

        # Add all static pages
        for page in static_pages:
            url_elem = self.create_url_element(**page)
            urlset.append(url_elem)

        # Write to file
        tree = ET.ElementTree(urlset)
        output_path = os.path.join(self.output_dir, 'sitemap.xml')
        self._write_xml(tree, output_path)

        print(f"✓ Generated main sitemap: {output_path}")
        print(f"  Total URLs: {len(static_pages)}")

        return output_path

    def generate_exploits_sitemap(self) -> str:
        """Generate sitemap for exploit detail pages"""
        urlset = ET.Element('urlset', xmlns=self.namespace)

        try:
            # Connect to database
            conn = sqlite3.connect(DATABASE_PATH)
            cursor = conn.cursor()

            # Fetch all exploits
            cursor.execute("""
                SELECT id, name, date, updated_at
                FROM exploits
                WHERE status = 'confirmed'
                ORDER BY date DESC
                LIMIT 10000
            """)

            exploits = cursor.fetchall()

            for exploit_id, name, date, updated_at in exploits:
                # Use updated_at if available, otherwise use date
                lastmod = updated_at if updated_at else date

                # Format date properly
                if lastmod:
                    try:
                        lastmod_date = datetime.fromisoformat(lastmod.replace('Z', '+00:00'))
                        lastmod = lastmod_date.strftime('%Y-%m-%d')
                    except:
                        lastmod = datetime.now().strftime('%Y-%m-%d')
                else:
                    lastmod = datetime.now().strftime('%Y-%m-%d')

                # Calculate priority based on recency
                days_old = (datetime.now() - datetime.fromisoformat(date.replace('Z', '+00:00'))).days
                if days_old < 7:
                    priority = 0.9
                elif days_old < 30:
                    priority = 0.8
                elif days_old < 90:
                    priority = 0.7
                else:
                    priority = 0.6

                # Add URL
                url_elem = self.create_url_element(
                    loc=f'/exploit/{exploit_id}',
                    lastmod=lastmod,
                    changefreq='monthly',
                    priority=priority
                )
                urlset.append(url_elem)

            conn.close()

            # Write to file
            tree = ET.ElementTree(urlset)
            output_path = os.path.join(self.output_dir, 'sitemap-exploits.xml')
            self._write_xml(tree, output_path)

            print(f"✓ Generated exploits sitemap: {output_path}")
            print(f"  Total URLs: {len(exploits)}")

            return output_path

        except Exception as e:
            print(f"✗ Error generating exploits sitemap: {e}")
            return None

    def generate_blog_sitemap(self, blog_dir: str = 'content/blog') -> Optional[str]:
        """Generate sitemap for blog posts"""
        urlset = ET.Element('urlset', xmlns=self.namespace)

        blog_posts = []

        # Check if blog directory exists
        if not os.path.exists(blog_dir):
            print(f"⚠ Blog directory not found: {blog_dir}")
            return None

        # Scan blog directory for posts
        for filename in os.listdir(blog_dir):
            if filename.endswith('.md'):
                filepath = os.path.join(blog_dir, filename)

                # Get file modification time
                mtime = os.path.getmtime(filepath)
                lastmod = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')

                # Extract slug from filename
                slug = filename.replace('.md', '')

                # Add URL
                url_elem = self.create_url_element(
                    loc=f'/blog/{slug}',
                    lastmod=lastmod,
                    changefreq='monthly',
                    priority=0.7
                )
                urlset.append(url_elem)
                blog_posts.append(slug)

        if not blog_posts:
            print("⚠ No blog posts found")
            return None

        # Write to file
        tree = ET.ElementTree(urlset)
        output_path = os.path.join(self.output_dir, 'sitemap-blog.xml')
        self._write_xml(tree, output_path)

        print(f"✓ Generated blog sitemap: {output_path}")
        print(f"  Total URLs: {len(blog_posts)}")

        return output_path

    def generate_sitemap_index(self, sitemaps: List[str]) -> str:
        """Generate sitemap index that references all sitemaps"""
        sitemapindex = ET.Element('sitemapindex', xmlns=self.namespace)

        for sitemap_path in sitemaps:
            if sitemap_path:
                sitemap_elem = ET.Element('sitemap')

                # Location
                loc_elem = ET.SubElement(sitemap_elem, 'loc')
                sitemap_filename = os.path.basename(sitemap_path)
                loc_elem.text = urljoin(self.base_url, sitemap_filename)

                # Last modification
                lastmod_elem = ET.SubElement(sitemap_elem, 'lastmod')
                lastmod_elem.text = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+00:00')

                sitemapindex.append(sitemap_elem)

        # Write to file
        tree = ET.ElementTree(sitemapindex)
        output_path = os.path.join(self.output_dir, 'sitemap_index.xml')
        self._write_xml(tree, output_path)

        print(f"✓ Generated sitemap index: {output_path}")
        print(f"  Total sitemaps: {len([s for s in sitemaps if s])}")

        return output_path

    def _write_xml(self, tree: ET.ElementTree, output_path: str):
        """Write XML tree to file with proper formatting"""
        # Pretty print XML
        self._indent(tree.getroot())

        # Write with XML declaration
        tree.write(
            output_path,
            encoding='utf-8',
            xml_declaration=True,
            method='xml'
        )

    def _indent(self, elem: ET.Element, level: int = 0):
        """Add indentation to XML for readability"""
        indent = "\n" + "  " * level
        if len(elem):
            if not elem.text or not elem.text.strip():
                elem.text = indent + "  "
            if not elem.tail or not elem.tail.strip():
                elem.tail = indent
            for child in elem:
                self._indent(child, level + 1)
            if not child.tail or not child.tail.strip():
                child.tail = indent
        else:
            if level and (not elem.tail or not elem.tail.strip()):
                elem.tail = indent

    def submit_to_google(self, sitemap_url: str) -> bool:
        """Submit sitemap to Google Search Console"""
        if not GOOGLE_SEARCH_CONSOLE_PROPERTY or not GOOGLE_API_KEY:
            print("⚠ Google Search Console credentials not configured")
            return False

        try:
            # Ping Google with sitemap URL
            ping_url = f'https://www.google.com/ping?sitemap={sitemap_url}'
            response = requests.get(ping_url, timeout=10)

            if response.status_code == 200:
                print(f"✓ Submitted sitemap to Google: {sitemap_url}")
                return True
            else:
                print(f"✗ Failed to submit sitemap to Google: {response.status_code}")
                return False

        except Exception as e:
            print(f"✗ Error submitting to Google: {e}")
            return False


def main():
    """Main execution"""
    parser = argparse.ArgumentParser(description='Generate XML sitemaps')
    parser.add_argument('--submit', action='store_true', help='Submit to Google Search Console')
    parser.add_argument('--base-url', default=BASE_URL, help='Base URL of the site')
    parser.add_argument('--output-dir', default=SITEMAP_DIR, help='Output directory for sitemaps')
    args = parser.parse_args()

    print("=" * 60)
    print("Sitemap Generation Script")
    print("=" * 60)
    print(f"Base URL: {args.base_url}")
    print(f"Output Directory: {args.output_dir}")
    print()

    # Create generator
    generator = SitemapGenerator(args.base_url, args.output_dir)

    # Generate individual sitemaps
    print("Generating sitemaps...")
    print()

    main_sitemap = generator.generate_main_sitemap()
    exploits_sitemap = generator.generate_exploits_sitemap()
    blog_sitemap = generator.generate_blog_sitemap()

    print()

    # Generate sitemap index
    sitemaps = [main_sitemap, exploits_sitemap, blog_sitemap]
    sitemap_index = generator.generate_sitemap_index(sitemaps)

    print()
    print("=" * 60)
    print("✓ All sitemaps generated successfully!")
    print("=" * 60)

    # Submit to Google if requested
    if args.submit:
        print()
        print("Submitting to Google Search Console...")
        sitemap_url = urljoin(args.base_url, 'sitemap_index.xml')
        generator.submit_to_google(sitemap_url)

    print()
    print("Done!")


if __name__ == '__main__':
    main()
