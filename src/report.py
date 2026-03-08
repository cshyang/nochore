"""Compatibility shim for the internal markdown report generator.

New code should import from ``src.reporting.internal`` or ``src.reporting``.
"""

from .reporting.internal import InternalReportGenerator, MarkdownReportGenerator

__all__ = ["InternalReportGenerator", "MarkdownReportGenerator"]
