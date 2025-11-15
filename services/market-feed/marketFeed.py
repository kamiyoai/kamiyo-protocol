import requests
import json
from datetime import datetime

# Phala Secure Storage API endpoint
PHALA_STORAGE_URL = "https://phala-worker.com/store_logs"  # Replace with actual Phala endpoint

def store_in_phala(log_data):
    """ Send market log to Phala Secure Storage """
    payload = {
        "key": "market_logs",  # Key under which logs are stored
        "value": json.dumps(log_data)
    }
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(PHALA_STORAGE_URL, json=payload, headers=headers)
        if response.status_code == 200:
            print("✅ Log stored in Phala Secure Storage")
        else:
            print(f"❌ Failed to store log: {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")

# Example log data (this will be updated dynamically in the main script)
log_entry = {
    "timestamp": datetime.utcnow().isoformat(),
    "sol_price": 130.25,  # Replace with dynamic price data
    "market_trend": "bullish",
    "news_sentiment": "positive"
}

# Store log in Phala
store_in_phala(log_entry)
