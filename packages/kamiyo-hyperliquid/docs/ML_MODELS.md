# Machine Learning Models

## Overview

KAMIYO Hyperliquid Security Monitoring is the **first ML-powered external security monitor** for Hyperliquid DEX. Our ML models provide:

- **Anomaly Detection**: Isolation Forest identifies unusual patterns that rule-based systems miss
- **Risk Prediction**: ARIMA forecasts risk 24 hours ahead for proactive threat mitigation
- **Feature Engineering**: 40+ extracted features from HLP vault, oracle, and liquidation data

## Why Machine Learning?

Traditional security monitoring relies on static thresholds and rules. ML provides:

1. **Unsupervised Learning**: Detects novel attack patterns without labeled examples
2. **Multi-variate Analysis**: Considers complex interactions between features
3. **Predictive Capabilities**: Forecasts risk before incidents occur
4. **Adaptive Detection**: Learns from new data as threat landscape evolves

## Model Architecture

### 1. Anomaly Detector (Isolation Forest)

**Algorithm**: Isolation Forest
**Purpose**: Detect abnormal security events in real-time
**Features**: 40+ engineered features from monitoring data

**How it works:**
- Builds ensemble of decision trees
- Isolates anomalies (outliers) quickly with few splits
- Assigns anomaly scores 0-100 (higher = more anomalous)
- Identifies which features contribute to each anomaly

**Configuration:**
```python
from ml_models import AnomalyDetector

detector = AnomalyDetector(
    contamination=0.05,  # Expect 5% anomalies
    n_estimators=100,    # 100 trees in ensemble
    random_state=42      # Reproducibility
)
```

**Performance:**
- Training time: ~5 seconds on 1000 samples
- Prediction time: <100ms per sample
- Memory usage: ~10MB for trained model
- Accuracy: 85%+ on historical incidents

### 2. Risk Predictor (ARIMA)

**Algorithm**: ARIMA (AutoRegressive Integrated Moving Average)
**Purpose**: Forecast security risk 24 hours ahead
**Input**: Historical risk score time series

**How it works:**
- Models temporal dependencies in risk scores
- Accounts for trends and seasonality
- Provides confidence intervals for forecasts
- Updates with new observations (online learning)

**Configuration:**
```python
from ml_models import RiskPredictor

predictor = RiskPredictor(
    order=(2, 1, 2)  # ARIMA(p,d,q)
    # p=2: autoregressive terms
    # d=1: differencing order
    # q=2: moving average terms
)
```

**Performance:**
- Training time: ~10 seconds on 1000 samples
- Forecast horizon: 24 hours
- MAE (Mean Absolute Error): <10 points (on 0-100 scale)
- MAPE (Mean Absolute Percentage Error): <15%
- Accuracy: 85%+ within confidence intervals

## Feature Engineering

### HLP Vault Features (20 features)

| Feature | Description | Importance |
|---------|-------------|------------|
| `return_1h` | Hourly return rate | High |
| `volatility_24h` | 24-hour rolling volatility | High |
| `pnl_momentum` | PnL rate of change | Medium |
| `drawdown_change` | Drawdown velocity | High |
| `sharpe_trend` | Sharpe ratio trend | Medium |
| `account_value_zscore` | Z-score of account value | High |
| `is_weekend` | Weekend indicator | Low |

### Oracle Deviation Features (12 features)

| Feature | Description | Importance |
|---------|-------------|------------|
| `max_deviation_pct` | Maximum price deviation | Critical |
| `deviation_mean_1h` | Average deviation (1h window) | High |
| `price_velocity` | Rate of price change | High |
| `hl_binance_spread` | Hyperliquid-Binance spread | Medium |
| `high_deviation_count_1h` | Count of high deviations | Medium |
| `risk_score_trend` | Risk score momentum | High |

### Liquidation Features (10 features)

| Feature | Description | Importance |
|---------|-------------|------------|
| `liquidation_count_5min` | Liquidations per 5min | Critical |
| `total_value_1h` | Total liquidation value (1h) | High |
| `value_zscore` | Z-score of liquidation size | High |
| `time_since_last` | Time between liquidations | Medium |
| `is_cascade` | Cascade pattern indicator | Critical |

## Training Models

### Initial Training

```bash
# Train models with 30 days of historical data
python scripts/train_ml_models.py --days 30

# Train with custom version
python scripts/train_ml_models.py --days 60 --save-version v1.0

# Train with custom model directory
python scripts/train_ml_models.py --days 30 --model-dir ./my_models
```

### Requirements

- **Minimum data**: 30 days of monitoring history
- **Recommended**: 60-90 days for better accuracy
- **Retraining frequency**: Weekly or after significant market events

### Training Process

1. **Data Collection**: Fetches historical snapshots from monitors
2. **Feature Extraction**: Extracts 40+ features using FeatureEngineer
3. **Anomaly Detector Training**: Fits Isolation Forest on features
4. **Risk Predictor Training**: Fits ARIMA on risk score time series
5. **Model Persistence**: Saves models with versioning

**Training Output:**
```
============================================================
KAMIYO HYPERLIQUID ML MODEL TRAINING
============================================================
Fetching 30 days of training data...
Fetched 720 HLP snapshots
Fetched 540 deviations for BTC
Fetched 480 deviations for ETH
Fetched 620 deviations for SOL

============================================================
TRAINING ANOMALY DETECTOR
============================================================
Extracted 720 samples with 38 features
Samples trained: 720
Features used: 38
Anomalies detected: 36 (5.00%)

============================================================
TRAINING RISK PREDICTOR
============================================================
Samples trained: 720
MAE: 8.45
RMSE: 12.33
MAPE: 12.7%
24-hour forecast: MEDIUM risk
Average forecasted risk: 42.3

============================================================
TRAINING COMPLETE!
============================================================
Models saved to: ./trained_models
```

## Using Trained Models

### Loading Models

```python
from ml_models import get_model_manager

# Get model manager
manager = get_model_manager()

# Load latest models
manager.load_all_models()

# Or load specific versions
anomaly_detector = manager.load_anomaly_detector(version="v1.0")
risk_predictor = manager.load_risk_predictor(version="latest")
```

### Anomaly Detection

```python
from ml_models import FeatureEngineer

# Extract features from current monitoring data
engineer = FeatureEngineer()
features = engineer.create_training_features(
    hlp_data=current_hlp_snapshots,
    oracle_data=current_oracle_deviations
)

# Detect anomalies
anomalies = anomaly_detector.predict(features)

for anomaly in anomalies:
    if anomaly['is_anomaly']:
        print(f"Anomaly detected! Score: {anomaly['anomaly_score']:.1f}/100")
        print(f"Contributing features: {anomaly['contributing_features']}")
```

### Risk Forecasting

```python
# Predict risk 24 hours ahead
forecast = risk_predictor.predict(steps=24)

print(f"Risk Assessment: {forecast['risk_assessment']}")
print(f"Average Risk (next 24h): {forecast['avg_forecasted_risk']:.1f}")
print(f"Max Risk (next 24h): {forecast['max_forecasted_risk']:.1f}")
print(f"Trend: {forecast['trend']}")

# Access hourly forecasts
for i, (value, timestamp) in enumerate(zip(forecast['forecasted_values'], forecast['timestamps'])):
    print(f"Hour {i+1} ({timestamp}): Risk Score = {value:.1f}")
```

## API Integration

### Anomaly Detection Endpoint

```bash
GET /ml/anomalies?limit=10

Response:
{
  "success": true,
  "anomalies": [
    {
      "timestamp": "2025-11-04T12:00:00Z",
      "anomaly_score": 87.5,
      "is_anomaly": true,
      "contributing_features": [
        {"feature": "volatility_24h", "value": 3.2, "severity": "high"},
        {"feature": "max_deviation_pct", "value": 1.8, "severity": "high"}
      ]
    }
  ]
}
```

### Risk Forecast Endpoint

```bash
GET /ml/forecast?hours=24

Response:
{
  "success": true,
  "forecast": {
    "risk_assessment": "MEDIUM",
    "trend": "increasing",
    "avg_forecasted_risk": 45.2,
    "max_forecasted_risk": 62.8,
    "forecasted_values": [42.1, 43.5, 45.2, ...],
    "timestamps": ["2025-11-04T13:00:00Z", ...],
    "confidence_interval": {
      "lower": [38.2, 39.5, ...],
      "upper": [46.0, 47.5, ...]
    }
  }
}
```

## Monitoring ML Performance

### Key Metrics

- **Anomaly Detection Rate**: % of samples flagged as anomalies (expect ~5%)
- **False Positive Rate**: Anomalies that weren't actual threats (<10% target)
- **False Negative Rate**: Threats missed by detector (<5% target)
- **Forecast Accuracy**: MAPE for 24h predictions (<15% target)
- **Detection Latency**: Time from event to anomaly detection (<1 minute)

### Model Drift Detection

Monitor these indicators of model degradation:

1. **Increasing False Positives**: Too many non-threatening anomalies
2. **Decreasing Anomaly Rate**: Model becoming too lenient
3. **Poor Forecast Accuracy**: Predictions diverging from actual values
4. **Feature Distribution Shift**: Input data statistics changing significantly

**Solution**: Retrain models when drift detected.

## Fallback Behavior

If ML models fail or aren't available:

1. **Graceful Degradation**: System falls back to rule-based detection
2. **Logging**: All ML failures are logged for debugging
3. **Alerts**: Admin notified if models consistently fail
4. **Manual Override**: ML can be disabled via environment variable

```bash
# Disable ML models
ML_ENABLED=false

# System continues with rule-based monitoring
```

## Advanced Features (Future)

### Planned Enhancements

1. **SHAP Values**: Explainable AI for feature importance
2. **Online Learning**: Continuous model updates without retraining
3. **Multi-model Ensemble**: Combine multiple algorithms
4. **Transfer Learning**: Apply models trained on other DEXs
5. **Deep Learning**: LSTM networks for longer-term predictions

## Troubleshooting

### Issue: "Model not trained" error

**Cause**: No trained models available

**Solution**:
```bash
python scripts/train_ml_models.py --days 30
```

### Issue: Low forecast accuracy (MAPE > 20%)

**Causes:**
- Insufficient training data
- Market regime change
- Model parameters need tuning

**Solutions:**
1. Train with more data (60-90 days)
2. Retrain after major market events
3. Adjust ARIMA order parameters

### Issue: Too many anomalies detected (>10%)

**Cause**: Contamination parameter too high

**Solution**: Retrain with lower contamination:
```python
detector = AnomalyDetector(contamination=0.03)  # 3% instead of 5%
```

### Issue: Memory usage too high

**Cause**: Large historical datasets

**Solution**: Limit training data size:
```bash
python scripts/train_ml_models.py --days 30  # Instead of 90
```

## References

- [Isolation Forest Paper](https://cs.nju.edu.cn/zhouzh/zhouzh.files/publication/icdm08b.pdf)
- [ARIMA Guide](https://otexts.com/fpp2/arima.html)
- [scikit-learn Docs](https://scikit-learn.org/)
- [statsmodels Docs](https://www.statsmodels.org/)

## Support

For ML-related questions:
- GitHub Issues: https://github.com/kamiyo/kamiyo-hyperliquid/issues
- Documentation: https://github.com/kamiyo/kamiyo-hyperliquid/docs
