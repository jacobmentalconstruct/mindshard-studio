# File: src/mindshard_backend/memory_layers.py
"""
Memory Layers: orchestrates multi-tiered memory for RAG workflows with built-in observability and resilience.

Layers:
- WorkingMemory: immediate in-RAM scratchpad for current context.
- ShortTermMemory: session-level summarization with threshold-based flush to long-term.
- LongTermMemory: durable vector-based storage via Digestor.
- MemoryLayers: unified interface for cross-layer queries, commits, and periodic maintenance.

Best Practices:
- Thread-safe operations for in-memory buffers.
- Async-compatible methods for non-blocking integration.
- Pluggable summarizer and configurable flush strategies.
- Prometheus metrics for key operations and latencies.
- Optional periodic flush scheduling.
"""
import threading
import logging
import asyncio
from typing import List, Dict, Any, Optional, Callable

from prometheus_client import Counter, Summary

from mindshard_backend.memory_manager import MemoryEntry, MemoryManager
from mindshard_backend.digestor import Digestor

logger = logging.getLogger(__name__)

# Metrics
WORKING_ADD_COUNTER       = Counter('mem_working_add_total',       'WorkingMemory add operations')
WORKING_LIST_COUNTER      = Counter('mem_working_list_total',      'WorkingMemory list operations')
WORKING_CLEAR_COUNTER     = Counter('mem_working_clear_total',     'WorkingMemory clear operations')

SHORTTERM_FLUSH_COUNTER   = Counter('mem_shortterm_flush_total',   'ShortTermMemory flushes')
SHORTTERM_FLUSH_LATENCY   = Summary('mem_shortterm_flush_latency_seconds','Latency of ShortTermMemory.flush')

LONGTERM_QUERY_COUNTER    = Counter('mem_longterm_query_total',    'LongTermMemory query operations')
LONGTERM_INGEST_COUNTER   = Counter('mem_longterm_ingest_total',   'LongTermMemory ingest operations')

QUERY_ALL_COUNTER         = Counter('mem_query_all_total',         'MemoryLayers query_all calls')
QUERY_ALL_LATENCY         = Summary('mem_query_all_latency_seconds','Latency of MemoryLayers.query_all')

COMMIT_TURN_COUNTER       = Counter('mem_commit_turn_total',       'MemoryLayers commit_turn calls')
CLEAR_ALL_COUNTER         = Counter('mem_clear_all_total',         'MemoryLayers clear_all calls')

class WorkingMemory:
    """
    In-memory scratchpad for immediate context.
    """
    def __init__(self, json_manager: MemoryManager):
        self._mgr = json_manager
        self._lock = threading.RLock()

    def add(self, entry: MemoryEntry) -> None:
        with self._lock:
            self._mgr.add_scratch(entry)
            WORKING_ADD_COUNTER.inc()
            logger.debug("WorkingMemory: added entry id=%s", entry.id)

    def list(self) -> List[MemoryEntry]:
        with self._lock:
            WORKING_LIST_COUNTER.inc()
            return self._mgr.get_scratch()

    def clear(self) -> None:
        with self._lock:
            self._mgr.scratchpad.clear()
            WORKING_CLEAR_COUNTER.inc()
            logger.info("WorkingMemory: cleared scratchpad")

class ShortTermMemory:
    """
    Session-level summaries flush from WorkingMemory into LongTermMemory.
    """
    def __init__(
        self,
        working: WorkingMemory,
        longterm: Digestor,
        summarizer: Callable[[str], str],
        threshold: int = 10
    ):
        self._working = working
        self._longterm = longterm
        self._summarizer = summarizer
        self._threshold = threshold
        self._lock = threading.RLock()

    @SHORTTERM_FLUSH_LATENCY.time()
    def flush(self) -> Optional[str]:
        """
        If scratchpad exceeds threshold, summarize and ingest summary.
        Returns summary text if flush occurred.
        """
        with self._lock:
            entries = self._working.list()
            if len(entries) < self._threshold:
                return None
            combined = '\n'.join(e.content for e in entries)
            try:
                summary = self._summarizer(combined)
                self._longterm.ingest_documents([
                    {'path': '<session-summary>', 'content': summary}
                ], force=True)
                self._working.clear()
                SHORTTERM_FLUSH_COUNTER.inc()
                logger.info("ShortTermMemory: flushed and ingested summary")
                return summary
            except Exception:
                logger.exception("ShortTermMemory: flush failed")
                return None

class LongTermMemory:
    """
    Durable layer exposing Digestor for persistent memory.
    """
    def __init__(self, digestor: Digestor):
        self._digestor = digestor

    def query(self, text: str, k: int = 5) -> List[Dict[str, Any]]:
        LONGTERM_QUERY_COUNTER.inc()
        try:
            return self._digestor.query(text, k)
        except Exception:
            logger.exception("LongTermMemory: query failed")
            return []

    def ingest(self, documents: List[Dict[str, str]], force: bool = False) -> None:
        LONGTERM_INGEST_COUNTER.inc()
        try:
            self._digestor.ingest_documents(documents, force)
        except Exception:
            logger.exception("LongTermMemory: ingest failed")

    def clear(self) -> None:
        try:
            self._digestor.clear()
            logger.info("LongTermMemory: cleared all data")
        except Exception:
            logger.exception("LongTermMemory: clear failed")

class MemoryLayers:
    """
    Unified interface over Working, ShortTerm, and LongTerm memory.
    Supports periodic flush scheduling and async operations.
    """
    def __init__(
        self,
        memory_mgr: MemoryManager,
        digestor: Digestor,
        summarizer: Callable[[str], str],
        flush_threshold: int = 10,
        periodic_flush_interval: Optional[int] = None
    ):
        self.working = WorkingMemory(memory_mgr)
        self.shortterm = ShortTermMemory(
            working=self.working,
            longterm=digestor,
            summarizer=summarizer,
            threshold=flush_threshold
        )
        self.longterm = LongTermMemory(digestor)
        self._periodic_task: Optional[asyncio.Task] = None
        if periodic_flush_interval:
            self._start_periodic_flush(periodic_flush_interval)

    def _start_periodic_flush(self, interval: int) -> None:
        """Launch background task for periodic flush."""
        try:
            loop = asyncio.get_event_loop()
            self._periodic_task = loop.create_task(self._run_periodic_flush(interval))
            logger.info("MemoryLayers: scheduled periodic flush every %ds", interval)
        except RuntimeError:
            logger.warning("MemoryLayers: could not schedule periodic flush (no event loop)")

    async def _run_periodic_flush(self, interval: int) -> None:
        while True:
            await asyncio.sleep(interval)
            flushed = self.shortterm.flush()
            if flushed:
                logger.info("MemoryLayers: periodic flush executed")

    @QUERY_ALL_LATENCY.time()
    def query_all(
        self,
        text: str,
        k_work: int = 2,
        k_long: int = 5
    ) -> List[Dict[str, Any]]:
        QUERY_ALL_COUNTER.inc()
        work_entries = self.working.list()[-k_work:]
        work_results = [
            {'source': 'working', 'entry': e}
            for e in work_entries
        ]
        long_results = [
            {'source': 'longterm', 'entry': e}
            for e in self.longterm.query(text, k_long)
        ]
        merged = work_results + long_results
        return merged

    async def aquery_all(self, text: str, k_work: int = 2, k_long: int = 5) -> List[Dict[str, Any]]:
        """Async wrapper for query_all."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self.query_all(text, k_work, k_long))

    def commit_turn(self, entry: MemoryEntry) -> None:
        COMMIT_TURN_COUNTER.inc()
        self.working.add(entry)
        flushed = self.shortterm.flush()
        if flushed:
            logger.debug("MemoryLayers: triggered short-term flush on commit")

    async def acommit_turn(self, entry: MemoryEntry) -> None:
        """Async wrapper for commit_turn."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: self.commit_turn(entry))

    def clear_all(self) -> None:
        CLEAR_ALL_COUNTER.inc()
        self.working.clear()
        self.longterm.clear()
        logger.info("MemoryLayers: cleared all layers")

