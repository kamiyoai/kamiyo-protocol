# -*- coding: utf-8 -*-
"""
Kamiyo API Response Optimizer
Optimizes JSON payloads for reduced bandwidth and faster transmission

Features:
- Field filtering (sparse fieldsets)
- Null/empty value removal
- Number precision optimization
- Date format standardization
- Response size tracking

Performance targets:
- Reduce payload size by 20-40% (without compression)
- <1ms optimization overhead
- Support field selection via query parameters
"""

import json
import logging
from typing import Any, Dict, List, Optional, Set, Union
from datetime import datetime, date
from decimal import Decimal

from fastapi import Query, Request
from pydantic import BaseModel

from monitoring.response_metrics import track_optimization_ratio

logger = logging.getLogger(__name__)


class OptimizerConfig:
    """Configuration for response optimization"""

    # Remove null values from responses
    REMOVE_NULLS: bool = True

    # Remove empty strings
    REMOVE_EMPTY_STRINGS: bool = True

    # Remove empty lists/dicts
    REMOVE_EMPTY_COLLECTIONS: bool = True

    # Number precision (decimal places)
    FLOAT_PRECISION: int = 2
    AMOUNT_PRECISION: int = 2  # For currency amounts

    # Date format (ISO 8601)
    DATE_FORMAT: str = '%Y-%m-%d'
    DATETIME_FORMAT: str = '%Y-%m-%dT%H:%M:%SZ'

    # Field filtering enabled
    ALLOW_FIELD_FILTERING: bool = True

    # Maximum fields to select (prevent abuse)
    MAX_FIELDS_SELECT: int = 50


class FieldSelector:
    """
    Handles sparse fieldsets via query parameters

    Usage:
        GET /exploits?fields=id,protocol,amount_lost
        Returns only specified fields

    Supports nested fields:
        GET /exploits?fields=id,metadata.chain,metadata.protocol
    """

    def __init__(self, fields: Optional[str] = None):
        """
        Initialize field selector

        Args:
            fields: Comma-separated list of fields to include
        """
        self.fields: Optional[Set[str]] = None
        self.nested_fields: Dict[str, Set[str]] = {}

        if fields:
            self._parse_fields(fields)

    def _parse_fields(self, fields_str: str):
        """
        Parse fields string into field set and nested fields

        Args:
            fields_str: Comma-separated fields (e.g., "id,name,meta.chain")
        """
        fields_list = [f.strip() for f in fields_str.split(',')]

        # Limit number of fields
        if len(fields_list) > OptimizerConfig.MAX_FIELDS_SELECT:
            logger.warning(f"Too many fields requested: {len(fields_list)}")
            fields_list = fields_list[:OptimizerConfig.MAX_FIELDS_SELECT]

        self.fields = set()
        self.nested_fields = {}

        for field in fields_list:
            if '.' in field:
                # Nested field (e.g., "metadata.chain")
                parts = field.split('.')
                parent = parts[0]
                child = '.'.join(parts[1:])

                self.fields.add(parent)
                if parent not in self.nested_fields:
                    self.nested_fields[parent] = set()
                self.nested_fields[parent].add(child)
            else:
                # Top-level field
                self.fields.add(field)

    def filter_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Filter dictionary to include only selected fields

        Args:
            data: Dictionary to filter

        Returns:
            Filtered dictionary
        """
        if self.fields is None:
            # No filtering
            return data

        filtered = {}

        for field in self.fields:
            if field in data:
                value = data[field]

                # Check for nested filtering
                if field in self.nested_fields and isinstance(value, dict):
                    nested_selector = FieldSelector()
                    nested_selector.fields = self.nested_fields[field]
                    value = nested_selector.filter_dict(value)

                filtered[field] = value

        return filtered

    def filter_list(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter list of dictionaries

        Args:
            data: List of dictionaries to filter

        Returns:
            List of filtered dictionaries
        """
        return [self.filter_dict(item) for item in data]


class ValueOptimizer:
    """
    Optimizes individual values in responses

    - Removes null/empty values
    - Formats numbers with appropriate precision
    - Standardizes date formats
    """

    def __init__(self, config: Optional[OptimizerConfig] = None):
        """
        Initialize value optimizer

        Args:
            config: Optimizer configuration
        """
        self.config = config or OptimizerConfig()

    def optimize_value(self, value: Any, field_name: Optional[str] = None) -> Any:
        """
        Optimize a single value

        Args:
            value: Value to optimize
            field_name: Field name (for context-specific optimization)

        Returns:
            Optimized value
        """
        # Handle None
        if value is None:
            return None

        # Handle strings
        if isinstance(value, str):
            return self._optimize_string(value)

        # Handle numbers
        if isinstance(value, (int, float, Decimal)):
            return self._optimize_number(value, field_name)

        # Handle dates
        if isinstance(value, (datetime, date)):
            return self._optimize_date(value)

        # Handle lists
        if isinstance(value, list):
            return self._optimize_list(value, field_name)

        # Handle dicts
        if isinstance(value, dict):
            return self._optimize_dict(value)

        # Return as-is for other types
        return value

    def _optimize_string(self, value: str) -> Optional[str]:
        """
        Optimize string value

        Args:
            value: String to optimize

        Returns:
            Optimized string or None if empty
        """
        if self.config.REMOVE_EMPTY_STRINGS and not value:
            return None

        return value

    def _optimize_number(
        self,
        value: Union[int, float, Decimal],
        field_name: Optional[str] = None
    ) -> Union[int, float]:
        """
        Optimize number value

        Args:
            value: Number to optimize
            field_name: Field name for context

        Returns:
            Optimized number
        """
        # Keep integers as-is
        if isinstance(value, int):
            return value

        # Determine precision based on field name
        precision = self.config.FLOAT_PRECISION

        if field_name:
            # Use higher precision for amount fields
            if 'amount' in field_name.lower() or 'loss' in field_name.lower():
                precision = self.config.AMOUNT_PRECISION

        # Round to precision
        return round(float(value), precision)

    def _optimize_date(self, value: Union[datetime, date]) -> str:
        """
        Optimize date value to ISO 8601 string

        Args:
            value: Date or datetime to optimize

        Returns:
            ISO 8601 formatted string
        """
        if isinstance(value, datetime):
            return value.strftime(self.config.DATETIME_FORMAT)
        else:
            return value.strftime(self.config.DATE_FORMAT)

    def _optimize_list(self, value: List[Any], field_name: Optional[str] = None) -> Optional[List[Any]]:
        """
        Optimize list value

        Args:
            value: List to optimize
            field_name: Field name

        Returns:
            Optimized list or None if empty
        """
        if self.config.REMOVE_EMPTY_COLLECTIONS and not value:
            return None

        # Recursively optimize list items
        optimized = [
            self.optimize_value(item, field_name)
            for item in value
        ]

        # Remove None values
        if self.config.REMOVE_NULLS:
            optimized = [item for item in optimized if item is not None]

        return optimized if optimized else None

    def _optimize_dict(self, value: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Optimize dictionary value

        Args:
            value: Dictionary to optimize

        Returns:
            Optimized dictionary or None if empty
        """
        if self.config.REMOVE_EMPTY_COLLECTIONS and not value:
            return None

        # Recursively optimize dict values
        optimized = {}

        for key, val in value.items():
            optimized_val = self.optimize_value(val, key)

            # Skip null values if configured
            if self.config.REMOVE_NULLS and optimized_val is None:
                continue

            optimized[key] = optimized_val

        return optimized if optimized else None


class ResponseOptimizer:
    """
    Main response optimizer

    Combines field filtering and value optimization
    """

    def __init__(
        self,
        config: Optional[OptimizerConfig] = None,
        track_metrics: bool = True
    ):
        """
        Initialize response optimizer

        Args:
            config: Optimizer configuration
            track_metrics: Whether to track optimization metrics
        """
        self.config = config or OptimizerConfig()
        self.value_optimizer = ValueOptimizer(self.config)
        self.track_metrics = track_metrics

    def optimize_response(
        self,
        data: Union[Dict[str, Any], List[Dict[str, Any]]],
        field_selector: Optional[FieldSelector] = None
    ) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Optimize response data

        Args:
            data: Response data to optimize
            field_selector: Optional field selector for sparse fieldsets

        Returns:
            Optimized response data
        """
        # Calculate original size
        original_size = len(json.dumps(data).encode())

        # Apply field filtering
        if field_selector and self.config.ALLOW_FIELD_FILTERING:
            if isinstance(data, list):
                data = field_selector.filter_list(data)
            elif isinstance(data, dict):
                data = field_selector.filter_dict(data)

        # Apply value optimization
        if isinstance(data, list):
            data = [
                self._optimize_dict_recursive(item)
                for item in data
            ]
        elif isinstance(data, dict):
            data = self._optimize_dict_recursive(data)

        # Calculate optimized size
        optimized_size = len(json.dumps(data).encode())

        # Track metrics
        if self.track_metrics and original_size > 0:
            optimization_ratio = original_size / optimized_size
            track_optimization_ratio(optimization_ratio)

            logger.debug(
                f"Optimized response: {original_size}B -> {optimized_size}B "
                f"({optimization_ratio:.2f}x)"
            )

        return data

    def _optimize_dict_recursive(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively optimize dictionary

        Args:
            data: Dictionary to optimize

        Returns:
            Optimized dictionary
        """
        optimized = {}

        for key, value in data.items():
            optimized_value = self.value_optimizer.optimize_value(value, key)

            # Skip null values if configured
            if self.config.REMOVE_NULLS and optimized_value is None:
                continue

            optimized[key] = optimized_value

        return optimized


class OptimizedResponse(BaseModel):
    """
    Response wrapper with optimization metadata

    Use this for debugging/monitoring optimization effectiveness
    """

    data: Any
    metadata: Dict[str, Any]

    class Config:
        arbitrary_types_allowed = True


# FastAPI dependencies and utilities

def get_field_selector(
    fields: Optional[str] = Query(
        None,
        description="Comma-separated list of fields to include (sparse fieldsets)"
    )
) -> Optional[FieldSelector]:
    """
    FastAPI dependency for field selection

    Usage:
        @app.get("/exploits")
        async def get_exploits(
            field_selector: Optional[FieldSelector] = Depends(get_field_selector)
        ):
            ...
    """
    if not fields:
        return None

    return FieldSelector(fields)


def optimize_response_dict(
    data: Dict[str, Any],
    request: Optional[Request] = None,
    field_selector: Optional[FieldSelector] = None
) -> Dict[str, Any]:
    """
    Optimize a dictionary response

    Args:
        data: Response data
        request: FastAPI request (for extracting query params)
        field_selector: Optional field selector

    Returns:
        Optimized response
    """
    optimizer = ResponseOptimizer()

    # Extract field selector from request if not provided
    if request and not field_selector:
        fields_param = request.query_params.get('fields')
        if fields_param:
            field_selector = FieldSelector(fields_param)

    return optimizer.optimize_response(data, field_selector)


def optimize_response_list(
    data: List[Dict[str, Any]],
    request: Optional[Request] = None,
    field_selector: Optional[FieldSelector] = None
) -> List[Dict[str, Any]]:
    """
    Optimize a list response

    Args:
        data: Response data
        request: FastAPI request
        field_selector: Optional field selector

    Returns:
        Optimized response
    """
    optimizer = ResponseOptimizer()

    # Extract field selector from request if not provided
    if request and not field_selector:
        fields_param = request.query_params.get('fields')
        if fields_param:
            field_selector = FieldSelector(fields_param)

    return optimizer.optimize_response(data, field_selector)


# Pydantic model optimizer

def optimize_pydantic_models(
    models: Union[BaseModel, List[BaseModel]],
    field_selector: Optional[FieldSelector] = None
) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Optimize Pydantic models

    Args:
        models: Pydantic model or list of models
        field_selector: Optional field selector

    Returns:
        Optimized dictionary or list of dictionaries
    """
    optimizer = ResponseOptimizer()

    if isinstance(models, list):
        data = [model.dict() for model in models]
    else:
        data = models.dict()

    return optimizer.optimize_response(data, field_selector)


# Response size utilities

def calculate_response_size(data: Any) -> int:
    """
    Calculate response size in bytes

    Args:
        data: Response data

    Returns:
        Size in bytes
    """
    return len(json.dumps(data).encode())


def calculate_size_reduction(original: Any, optimized: Any) -> Dict[str, Any]:
    """
    Calculate size reduction statistics

    Args:
        original: Original data
        optimized: Optimized data

    Returns:
        Size reduction statistics
    """
    original_size = calculate_response_size(original)
    optimized_size = calculate_response_size(optimized)

    reduction = original_size - optimized_size
    reduction_pct = (reduction / original_size * 100) if original_size > 0 else 0

    return {
        'original_size_bytes': original_size,
        'optimized_size_bytes': optimized_size,
        'reduction_bytes': reduction,
        'reduction_percent': round(reduction_pct, 2),
        'optimization_ratio': round(original_size / optimized_size, 2) if optimized_size > 0 else 1.0
    }
