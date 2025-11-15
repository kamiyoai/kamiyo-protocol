"""
Frontend Metrics Monitoring

Receives and stores frontend performance metrics including:
- Web Vitals (CLS, FID, LCP, FCP, TTFB)
- Custom performance marks
- API response times
- JavaScript errors
- Resource timing

Exports metrics to Prometheus for monitoring and alerting
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, validator
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
import sqlite3
import os
from prometheus_client import Counter, Histogram, Gauge
import json

# Configuration
DATABASE_PATH = os.getenv('DATABASE_PATH', 'data/kamiyo.db')
METRICS_RETENTION_DAYS = int(os.getenv('METRICS_RETENTION_DAYS', '30'))

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])

# Prometheus metrics
web_vitals_lcp = Histogram(
    'frontend_lcp_seconds',
    'Largest Contentful Paint in seconds',
    buckets=[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]
)

web_vitals_fid = Histogram(
    'frontend_fid_milliseconds',
    'First Input Delay in milliseconds',
    buckets=[50, 100, 150, 200, 250, 300, 400, 500]
)

web_vitals_cls = Histogram(
    'frontend_cls_score',
    'Cumulative Layout Shift score',
    buckets=[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]
)

web_vitals_fcp = Histogram(
    'frontend_fcp_seconds',
    'First Contentful Paint in seconds',
    buckets=[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]
)

web_vitals_ttfb = Histogram(
    'frontend_ttfb_milliseconds',
    'Time to First Byte in milliseconds',
    buckets=[100, 200, 400, 600, 800, 1000, 1500, 2000]
)

api_performance = Histogram(
    'frontend_api_duration_seconds',
    'Frontend API request duration in seconds',
    ['endpoint', 'method', 'status']
)

navigation_timing = Histogram(
    'frontend_navigation_timing_seconds',
    'Navigation timing metrics in seconds',
    ['metric_name']
)

js_errors = Counter(
    'frontend_javascript_errors_total',
    'Total JavaScript errors',
    ['error_type']
)

long_tasks = Counter(
    'frontend_long_tasks_total',
    'Total long tasks (>50ms)'
)

page_views = Counter(
    'frontend_page_views_total',
    'Total page views',
    ['path']
)

# Models
class WebVitalMetric(BaseModel):
    type: str  # 'web_vital'
    data: Dict[str, Any]
    timestamp: int
    url: str
    userAgent: str

    @validator('data')
    def validate_web_vital_data(cls, v):
        required_fields = ['name', 'value', 'rating']
        for field in required_fields:
            if field not in v:
                raise ValueError(f'Missing required field: {field}')
        return v


class NavigationTimingMetric(BaseModel):
    type: str  # 'navigation_timing'
    data: Dict[str, float]
    timestamp: int
    url: str
    userAgent: str


class ApiPerformanceMetric(BaseModel):
    type: str  # 'api_performance'
    data: Dict[str, Any]
    timestamp: int
    url: str
    userAgent: str

    @validator('data')
    def validate_api_data(cls, v):
        required_fields = ['endpoint', 'method', 'duration', 'status', 'success']
        for field in required_fields:
            if field not in v:
                raise ValueError(f'Missing required field: {field}')
        return v


class ErrorMetric(BaseModel):
    type: str  # 'error'
    data: Dict[str, Any]
    timestamp: int
    url: str
    userAgent: str

    @validator('data')
    def validate_error_data(cls, v):
        if 'message' not in v:
            raise ValueError('Missing required field: message')
        return v


class ResourceTimingMetric(BaseModel):
    type: str  # 'resource_timing'
    data: Dict[str, Any]
    timestamp: int
    url: str
    userAgent: str


class PageViewMetric(BaseModel):
    type: str  # 'page_view'
    data: Dict[str, str]
    timestamp: int
    url: str
    userAgent: str


# Database functions
def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def create_metrics_tables():
    """Create metrics tables if they don't exist"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS frontend_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            url TEXT NOT NULL,
            user_agent TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_metrics_type
        ON frontend_metrics(type)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
        ON frontend_metrics(timestamp)
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS frontend_web_vitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_name TEXT NOT NULL,
            value REAL NOT NULL,
            rating TEXT NOT NULL,
            url TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_web_vitals_name
        ON frontend_web_vitals(metric_name)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_web_vitals_timestamp
        ON frontend_web_vitals(timestamp)
    """)

    conn.commit()
    conn.close()


# Initialize tables
create_metrics_tables()


def store_metric(metric_type: str, data: Dict[str, Any], url: str, user_agent: str, timestamp: int):
    """Store metric in database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO frontend_metrics
            (type, data, url, user_agent, timestamp, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            metric_type,
            json.dumps(data),
            url,
            user_agent,
            timestamp,
            datetime.utcnow().isoformat()
        ))

        conn.commit()
    except Exception as e:
        print(f"Error storing metric: {e}")
        conn.rollback()
    finally:
        conn.close()


def store_web_vital(name: str, value: float, rating: str, url: str, timestamp: int):
    """Store web vital metric"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO frontend_web_vitals
            (metric_name, value, rating, url, timestamp, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            name,
            value,
            rating,
            url,
            timestamp,
            datetime.utcnow().isoformat()
        ))

        conn.commit()
    except Exception as e:
        print(f"Error storing web vital: {e}")
        conn.rollback()
    finally:
        conn.close()


# API Endpoints
@router.post("/performance")
async def track_performance(
    metric: Union[
        WebVitalMetric,
        NavigationTimingMetric,
        ApiPerformanceMetric,
        ErrorMetric,
        ResourceTimingMetric,
        PageViewMetric
    ],
    background_tasks: BackgroundTasks
):
    """
    Track frontend performance metric

    Accepts various metric types and stores them for analysis
    """
    try:
        # Store metric in background
        background_tasks.add_task(
            store_metric,
            metric.type,
            metric.data,
            metric.url,
            metric.userAgent,
            metric.timestamp
        )

        # Update Prometheus metrics
        if metric.type == 'web_vital':
            name = metric.data['name']
            value = metric.data['value']
            rating = metric.data['rating']

            # Convert value based on metric type
            if name == 'LCP':
                web_vitals_lcp.observe(value / 1000)  # Convert to seconds
            elif name == 'FID':
                web_vitals_fid.observe(value)
            elif name == 'CLS':
                web_vitals_cls.observe(value)
            elif name == 'FCP':
                web_vitals_fcp.observe(value / 1000)
            elif name == 'TTFB':
                web_vitals_ttfb.observe(value)

            # Store in dedicated table
            background_tasks.add_task(
                store_web_vital,
                name,
                value,
                rating,
                metric.url,
                metric.timestamp
            )

        elif metric.type == 'navigation_timing':
            for name, value in metric.data.items():
                if value > 0:
                    navigation_timing.labels(metric_name=name).observe(value / 1000)

        elif metric.type == 'api_performance':
            api_performance.labels(
                endpoint=metric.data['endpoint'],
                method=metric.data['method'],
                status=str(metric.data['status'])
            ).observe(metric.data['duration'] / 1000)

        elif metric.type == 'error':
            error_type = metric.data.get('error_type', 'unknown')
            js_errors.labels(error_type=error_type).inc()

        elif metric.type == 'page_view':
            path = metric.data.get('path', '/')
            page_views.labels(path=path).inc()

        return {
            'success': True,
            'message': 'Metric tracked successfully'
        }

    except Exception as e:
        print(f"Error tracking performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/web-vitals")
async def get_web_vitals_stats(
    metric_name: Optional[str] = None,
    hours: int = 24
):
    """Get Web Vitals statistics"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cutoff_time = int((datetime.utcnow() - timedelta(hours=hours)).timestamp() * 1000)

        if metric_name:
            cursor.execute("""
                SELECT
                    metric_name,
                    AVG(value) as avg_value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    COUNT(*) as count,
                    SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                    SUM(CASE WHEN rating = 'needs-improvement' THEN 1 ELSE 0 END) as needs_improvement_count,
                    SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) as poor_count
                FROM frontend_web_vitals
                WHERE metric_name = ? AND timestamp >= ?
                GROUP BY metric_name
            """, (metric_name, cutoff_time))
        else:
            cursor.execute("""
                SELECT
                    metric_name,
                    AVG(value) as avg_value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    COUNT(*) as count,
                    SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                    SUM(CASE WHEN rating = 'needs-improvement' THEN 1 ELSE 0 END) as needs_improvement_count,
                    SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) as poor_count
                FROM frontend_web_vitals
                WHERE timestamp >= ?
                GROUP BY metric_name
            """, (cutoff_time,))

        results = cursor.fetchall()

        stats = []
        for row in results:
            total = row['count']
            stats.append({
                'metric_name': row['metric_name'],
                'avg_value': round(row['avg_value'], 2),
                'min_value': round(row['min_value'], 2),
                'max_value': round(row['max_value'], 2),
                'count': total,
                'ratings': {
                    'good': {
                        'count': row['good_count'],
                        'percentage': round((row['good_count'] / total * 100) if total > 0 else 0, 1)
                    },
                    'needs_improvement': {
                        'count': row['needs_improvement_count'],
                        'percentage': round((row['needs_improvement_count'] / total * 100) if total > 0 else 0, 1)
                    },
                    'poor': {
                        'count': row['poor_count'],
                        'percentage': round((row['poor_count'] / total * 100) if total > 0 else 0, 1)
                    }
                }
            })

        return {
            'stats': stats,
            'period_hours': hours,
            'timestamp': datetime.utcnow().isoformat()
        }

    finally:
        conn.close()


@router.delete("/cleanup")
async def cleanup_old_metrics():
    """Clean up old metrics (older than retention period)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cutoff_time = int((datetime.utcnow() - timedelta(days=METRICS_RETENTION_DAYS)).timestamp() * 1000)

        cursor.execute(
            "DELETE FROM frontend_metrics WHERE timestamp < ?",
            (cutoff_time,)
        )
        metrics_deleted = cursor.rowcount

        cursor.execute(
            "DELETE FROM frontend_web_vitals WHERE timestamp < ?",
            (cutoff_time,)
        )
        vitals_deleted = cursor.rowcount

        conn.commit()

        return {
            'success': True,
            'metrics_deleted': metrics_deleted,
            'vitals_deleted': vitals_deleted,
            'retention_days': METRICS_RETENTION_DAYS
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# Import Union for type hints
from typing import Union
