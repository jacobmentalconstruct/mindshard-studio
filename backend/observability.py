# File: backend/observability.py
from __future__ import annotations

import os
import atexit
import logging
from typing import Optional

from backend.config import get_settings

log = logging.getLogger("observability")

# ----- Sentry -----
def init_sentry() -> None:
    settings = get_settings()
    if not settings.sentry_dsn:
        log.info("sentry.disabled")
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_logging = LoggingIntegration(
            level=logging.INFO,        # capture info and above as breadcrumbs
            event_level=logging.ERROR  # send errors as events
        )

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            integrations=[FastApiIntegration(), sentry_logging],
            environment=str(settings.env),
            traces_sample_rate=0.1 if settings.tracing_enabled else 0.0,
            send_default_pii=False,  # keep it lean; add user context explicitly if needed
        )
        log.info("sentry.enabled", extra={"env": str(settings.env)})
    except Exception as e:
        log.exception("sentry.init_failed: %s", e)


# ----- OpenTelemetry (traces + metrics via OTLP) -----
_otel_shutdown = None  # type: Optional[callable]

def init_opentelemetry(app_name: str = "mindshard-backend") -> None:
    """
    Initializes OTel tracing and metrics exporters (OTLP).
    Controlled by:
      - settings.tracing_enabled
      - settings.metrics_enabled
      - settings.otlp_endpoint   (e.g., http://localhost:4318)
    """
    settings = get_settings()
    if not (settings.tracing_enabled or settings.metrics_enabled):
        return

    try:
        from opentelemetry import trace, metrics
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter

        # FastAPI/requests auto-instrumentation
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor  # optional
            have_httpx = True
        except Exception:
            have_httpx = False

        endpoint = settings.otlp_endpoint or "http://localhost:4318"
        # You can pass custom headers via env if needed (e.g., API tokens)
        # Example: OTEL_EXPORTER_OTLP_HEADERS="x-otlp-token=abc123"
        headers = os.getenv("OTEL_EXPORTER_OTLP_HEADERS")

        resource = Resource.create({
            "service.name": app_name,
            "service.version": settings.app_version,
            "deployment.environment": str(settings.env),
        })

        # ---- Tracing ----
        if settings.tracing_enabled:
            tracer_provider = TracerProvider(resource=resource)
            span_exporter = OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces", headers=headers)
            tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
            trace.set_tracer_provider(tracer_provider)

            # Instrument FastAPI/ASGI + outgoing HTTP
            # FastAPIInstrumentor will be run in main.py after app creation;
            # here we just ensure global libs (requests/httpx) are instrumented.
            RequestsInstrumentor().instrument()
            if have_httpx:
                HTTPXClientInstrumentor().instrument()

            log.info("otel.tracing.enabled", extra={"endpoint": endpoint})

        # ---- Metrics ----
        if settings.metrics_enabled:
            reader = PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics", headers=headers)
            )
            meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
            metrics.set_meter_provider(meter_provider)
            log.info("otel.metrics.enabled", extra={"endpoint": endpoint})

        def _shutdown():
            # Flush/best-effort shutdown to avoid dropping spans on exit
            try:
                if settings.tracing_enabled:
                    tp = trace.get_tracer_provider()
                    if hasattr(tp, "shutdown"):
                        tp.shutdown()
                if settings.metrics_enabled:
                    mp = metrics.get_meter_provider()
                    if hasattr(mp, "shutdown"):
                        mp.shutdown()
            except Exception as e:
                log.warning("otel.shutdown.error: %s", e)

        global _otel_shutdown
        _otel_shutdown = _shutdown
        atexit.register(_shutdown)

    except Exception as e:
        log.exception("otel.init_failed: %s", e)

def instrument_fastapi_app(app) -> None:
    """Attach FastAPI/ASGI tracing to the given app (call after app creation)."""
    settings = get_settings()
    if not settings.tracing_enabled:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware

        # Adds middleware for context propagation + server spans
        app.add_middleware(OpenTelemetryMiddleware)
        FastAPIInstrumentor.instrument_app(app)
    except Exception as e:
        log.exception("otel.fastapi_instrument_failed: %s", e)

def shutdown_opentelemetry() -> None:
    global _otel_shutdown
    if _otel_shutdown:
        _otel_shutdown()
        _otel_shutdown = None
