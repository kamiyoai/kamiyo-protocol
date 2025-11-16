# -*- coding: utf-8 -*-
"""
Kamiyo Parallel Aggregator Executor
Executes multiple aggregators concurrently for maximum speed

Features:
- Parallel execution using asyncio
- Configurable concurrency limits
- Timeout handling per aggregator
- Error isolation (one failure doesn't stop others)
- Progress tracking
- Execution metrics

Performance targets:
- Full cycle time: <30 seconds (all sources)
- Individual timeout: 10 seconds
- Concurrent execution: 10 sources at once
- 99% aggregator uptime
"""

import asyncio
import logging
import time
from typing import List, Dict, Any, Optional, Callable, Coroutine
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from monitoring.aggregator_metrics import (
    track_aggregator_execution,
    track_aggregator_success,
    track_aggregator_failure,
    track_aggregation_cycle_time
)

logger = logging.getLogger(__name__)


class ExecutionStatus(Enum):
    """Aggregator execution status"""
    PENDING = 'pending'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'
    TIMEOUT = 'timeout'
    SKIPPED = 'skipped'


@dataclass
class ExecutionResult:
    """Result from aggregator execution"""
    source_name: str
    status: ExecutionStatus
    exploits_found: int = 0
    execution_time: float = 0.0
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'source_name': self.source_name,
            'status': self.status.value,
            'exploits_found': self.exploits_found,
            'execution_time': self.execution_time,
            'error': self.error,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class ParallelExecutorConfig:
    """Configuration for parallel execution"""

    # Maximum concurrent aggregators
    MAX_CONCURRENT: int = 10

    # Timeout per aggregator (seconds)
    AGGREGATOR_TIMEOUT: int = 10

    # Total cycle timeout (seconds)
    CYCLE_TIMEOUT: int = 60

    # Retry failed aggregators
    RETRY_FAILED: bool = False

    # Maximum retries
    MAX_RETRIES: int = 1


class AggregatorTask:
    """Wrapper for aggregator execution task"""

    def __init__(
        self,
        source_name: str,
        execute_func: Callable[[], Coroutine[Any, Any, List[Dict[str, Any]]]],
        timeout: int = ParallelExecutorConfig.AGGREGATOR_TIMEOUT
    ):
        """
        Initialize aggregator task

        Args:
            source_name: Name of aggregation source
            execute_func: Async function that executes aggregation
            timeout: Timeout in seconds
        """
        self.source_name = source_name
        self.execute_func = execute_func
        self.timeout = timeout
        self.result: Optional[ExecutionResult] = None

    async def execute(self) -> ExecutionResult:
        """
        Execute aggregator task

        Returns:
            Execution result
        """
        started_at = datetime.utcnow()
        start_time = time.time()

        result = ExecutionResult(
            source_name=self.source_name,
            status=ExecutionStatus.RUNNING,
            started_at=started_at
        )

        try:
            logger.info(f"Starting aggregator: {self.source_name}")

            # Execute with timeout
            exploits = await asyncio.wait_for(
                self.execute_func(),
                timeout=self.timeout
            )

            # Calculate execution time
            execution_time = time.time() - start_time

            # Update result
            result.status = ExecutionStatus.SUCCESS
            result.exploits_found = len(exploits) if exploits else 0
            result.execution_time = execution_time
            result.completed_at = datetime.utcnow()

            # Track metrics
            track_aggregator_execution(self.source_name, execution_time)
            track_aggregator_success(self.source_name, result.exploits_found)

            logger.info(
                f"Aggregator {self.source_name} completed: "
                f"{result.exploits_found} exploits in {execution_time:.2f}s"
            )

        except asyncio.TimeoutError:
            execution_time = time.time() - start_time
            result.status = ExecutionStatus.TIMEOUT
            result.execution_time = execution_time
            result.completed_at = datetime.utcnow()
            result.error = f"Timeout after {self.timeout}s"

            track_aggregator_failure(self.source_name, 'timeout')

            logger.error(f"Aggregator {self.source_name} timed out after {self.timeout}s")

        except Exception as e:
            execution_time = time.time() - start_time
            result.status = ExecutionStatus.FAILED
            result.execution_time = execution_time
            result.completed_at = datetime.utcnow()
            result.error = str(e)

            track_aggregator_failure(self.source_name, 'error')

            logger.error(f"Aggregator {self.source_name} failed: {e}")

        self.result = result
        return result


class ParallelExecutor:
    """
    Executes aggregators in parallel

    Uses asyncio semaphore to limit concurrency
    """

    def __init__(
        self,
        max_concurrent: int = ParallelExecutorConfig.MAX_CONCURRENT,
        cycle_timeout: int = ParallelExecutorConfig.CYCLE_TIMEOUT
    ):
        """
        Initialize parallel executor

        Args:
            max_concurrent: Maximum concurrent aggregators
            cycle_timeout: Total cycle timeout in seconds
        """
        self.max_concurrent = max_concurrent
        self.cycle_timeout = cycle_timeout
        self.semaphore = asyncio.Semaphore(max_concurrent)

        logger.info(
            f"Parallel executor initialized: "
            f"max_concurrent={max_concurrent}, "
            f"cycle_timeout={cycle_timeout}s"
        )

    async def _execute_with_semaphore(self, task: AggregatorTask) -> ExecutionResult:
        """
        Execute task with semaphore (rate limiting)

        Args:
            task: Aggregator task

        Returns:
            Execution result
        """
        async with self.semaphore:
            return await task.execute()

    async def execute_all(
        self,
        tasks: List[AggregatorTask],
        progress_callback: Optional[Callable[[ExecutionResult], None]] = None
    ) -> List[ExecutionResult]:
        """
        Execute all aggregator tasks in parallel

        Args:
            tasks: List of aggregator tasks
            progress_callback: Optional callback for progress updates

        Returns:
            List of execution results
        """
        if not tasks:
            logger.warning("No aggregator tasks to execute")
            return []

        logger.info(f"Starting parallel execution of {len(tasks)} aggregators")
        cycle_start_time = time.time()

        try:
            # Create coroutines with semaphore
            coroutines = [
                self._execute_with_semaphore(task)
                for task in tasks
            ]

            # Execute all with cycle timeout
            results = await asyncio.wait_for(
                asyncio.gather(*coroutines, return_exceptions=True),
                timeout=self.cycle_timeout
            )

            # Process results
            execution_results = []

            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    # Handle exception from gather
                    logger.error(f"Task {tasks[i].source_name} raised exception: {result}")
                    execution_results.append(
                        ExecutionResult(
                            source_name=tasks[i].source_name,
                            status=ExecutionStatus.FAILED,
                            error=str(result),
                            execution_time=0.0
                        )
                    )
                else:
                    execution_results.append(result)

                    # Call progress callback
                    if progress_callback:
                        try:
                            progress_callback(result)
                        except Exception as e:
                            logger.error(f"Progress callback failed: {e}")

            # Calculate cycle time
            cycle_time = time.time() - cycle_start_time

            # Track cycle metrics
            track_aggregation_cycle_time(cycle_time)

            # Log summary
            self._log_summary(execution_results, cycle_time)

            return execution_results

        except asyncio.TimeoutError:
            cycle_time = time.time() - cycle_start_time
            logger.error(f"Aggregation cycle timed out after {self.cycle_timeout}s")

            # Mark incomplete tasks as timeout
            execution_results = []
            for task in tasks:
                if task.result:
                    execution_results.append(task.result)
                else:
                    execution_results.append(
                        ExecutionResult(
                            source_name=task.source_name,
                            status=ExecutionStatus.TIMEOUT,
                            error=f"Cycle timeout after {self.cycle_timeout}s",
                            execution_time=cycle_time
                        )
                    )

            return execution_results

        except Exception as e:
            logger.error(f"Parallel execution failed: {e}")
            raise

    def _log_summary(self, results: List[ExecutionResult], cycle_time: float):
        """
        Log execution summary

        Args:
            results: Execution results
            cycle_time: Total cycle time
        """
        total = len(results)
        success = sum(1 for r in results if r.status == ExecutionStatus.SUCCESS)
        failed = sum(1 for r in results if r.status == ExecutionStatus.FAILED)
        timeout = sum(1 for r in results if r.status == ExecutionStatus.TIMEOUT)
        total_exploits = sum(r.exploits_found for r in results)

        logger.info(
            f"Aggregation cycle completed in {cycle_time:.2f}s:\n"
            f"  Total: {total} aggregators\n"
            f"  Success: {success} ({success/total*100:.1f}%)\n"
            f"  Failed: {failed}\n"
            f"  Timeout: {timeout}\n"
            f"  Total exploits: {total_exploits}"
        )

    async def execute_with_retry(
        self,
        tasks: List[AggregatorTask],
        max_retries: int = ParallelExecutorConfig.MAX_RETRIES,
        progress_callback: Optional[Callable[[ExecutionResult], None]] = None
    ) -> List[ExecutionResult]:
        """
        Execute aggregators with retry for failed tasks

        Args:
            tasks: List of aggregator tasks
            max_retries: Maximum retry attempts
            progress_callback: Optional progress callback

        Returns:
            List of execution results (after retries)
        """
        all_results = {}

        for attempt in range(max_retries + 1):
            # Determine which tasks to execute
            if attempt == 0:
                # First attempt: all tasks
                tasks_to_execute = tasks
            else:
                # Retry: only failed/timeout tasks
                tasks_to_execute = [
                    task for task in tasks
                    if task.source_name in all_results and
                    all_results[task.source_name].status in (
                        ExecutionStatus.FAILED,
                        ExecutionStatus.TIMEOUT
                    )
                ]

                if not tasks_to_execute:
                    logger.info("No failed tasks to retry")
                    break

                logger.info(
                    f"Retry attempt {attempt}/{max_retries}: "
                    f"{len(tasks_to_execute)} tasks"
                )

            # Execute tasks
            results = await self.execute_all(tasks_to_execute, progress_callback)

            # Update results
            for result in results:
                all_results[result.source_name] = result

        # Convert to list
        return list(all_results.values())


class AggregatorExecutorBuilder:
    """
    Builder for creating parallel executor with aggregator tasks

    Makes it easier to configure and execute aggregators
    """

    def __init__(self):
        """Initialize builder"""
        self.tasks: List[AggregatorTask] = []
        self.max_concurrent = ParallelExecutorConfig.MAX_CONCURRENT
        self.cycle_timeout = ParallelExecutorConfig.CYCLE_TIMEOUT
        self.retry_failed = ParallelExecutorConfig.RETRY_FAILED
        self.max_retries = ParallelExecutorConfig.MAX_RETRIES

    def add_aggregator(
        self,
        source_name: str,
        execute_func: Callable[[], Coroutine[Any, Any, List[Dict[str, Any]]]],
        timeout: int = ParallelExecutorConfig.AGGREGATOR_TIMEOUT
    ) -> 'AggregatorExecutorBuilder':
        """
        Add aggregator to executor

        Args:
            source_name: Source name
            execute_func: Async execution function
            timeout: Aggregator timeout

        Returns:
            Self for chaining
        """
        task = AggregatorTask(source_name, execute_func, timeout)
        self.tasks.append(task)
        return self

    def set_max_concurrent(self, max_concurrent: int) -> 'AggregatorExecutorBuilder':
        """Set maximum concurrent aggregators"""
        self.max_concurrent = max_concurrent
        return self

    def set_cycle_timeout(self, cycle_timeout: int) -> 'AggregatorExecutorBuilder':
        """Set cycle timeout"""
        self.cycle_timeout = cycle_timeout
        return self

    def enable_retry(
        self,
        max_retries: int = ParallelExecutorConfig.MAX_RETRIES
    ) -> 'AggregatorExecutorBuilder':
        """Enable retry for failed aggregators"""
        self.retry_failed = True
        self.max_retries = max_retries
        return self

    async def execute(
        self,
        progress_callback: Optional[Callable[[ExecutionResult], None]] = None
    ) -> List[ExecutionResult]:
        """
        Execute all aggregators

        Args:
            progress_callback: Optional progress callback

        Returns:
            List of execution results
        """
        executor = ParallelExecutor(
            max_concurrent=self.max_concurrent,
            cycle_timeout=self.cycle_timeout
        )

        if self.retry_failed:
            return await executor.execute_with_retry(
                self.tasks,
                max_retries=self.max_retries,
                progress_callback=progress_callback
            )
        else:
            return await executor.execute_all(
                self.tasks,
                progress_callback=progress_callback
            )


# Convenience functions

def create_executor() -> AggregatorExecutorBuilder:
    """
    Create aggregator executor builder

    Returns:
        Builder instance
    """
    return AggregatorExecutorBuilder()


async def execute_aggregators_parallel(
    aggregators: Dict[str, Callable[[], Coroutine[Any, Any, List[Dict[str, Any]]]]],
    max_concurrent: int = ParallelExecutorConfig.MAX_CONCURRENT,
    timeout: int = ParallelExecutorConfig.AGGREGATOR_TIMEOUT
) -> List[ExecutionResult]:
    """
    Execute aggregators in parallel (simple interface)

    Args:
        aggregators: Dictionary of {source_name: execute_func}
        max_concurrent: Maximum concurrent executions
        timeout: Timeout per aggregator

    Returns:
        List of execution results
    """
    builder = create_executor().set_max_concurrent(max_concurrent)

    for source_name, execute_func in aggregators.items():
        builder.add_aggregator(source_name, execute_func, timeout)

    return await builder.execute()
