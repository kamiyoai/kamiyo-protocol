"""
x402 Infrastructure Python SDK Setup
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="x402-python",
    version="1.0.0",
    description="Official x402 Infrastructure Python SDK",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="KAMIYO",
    author_email="dev@kamiyo.ai",
    url="https://github.com/kamiyo-ai/x402-python",
    packages=find_packages(),
    install_requires=[
        "httpx>=0.25.0",
    ],
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    keywords="x402 payments crypto blockchain usdc verification",
    project_urls={
        "Documentation": "https://kamiyo.ai/docs/x402",
        "Source": "https://github.com/kamiyo-ai/x402-python",
        "Tracker": "https://github.com/kamiyo-ai/x402-python/issues",
    },
)
