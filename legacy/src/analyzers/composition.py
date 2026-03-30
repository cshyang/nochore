"""Composition analyzer for dimension breakdown analysis."""
import logging
from typing import Dict, List, Optional

import polars as pl

from ..models import (
    CompositionBreakdown,
    CompositionSegment,
    CompositionShift,
)

logger = logging.getLogger(__name__)


class CompositionAnalyzer:
    """Analyzes metric composition across dimensions."""

    def __init__(self, df: pl.DataFrame):
        self.df = df

    def analyze_dimension(
        self,
        dimension: str,
        currency: Optional[str] = None,
    ) -> Optional[CompositionBreakdown]:
        """Analyze composition for a single dimension."""
        if self.df.is_empty():
            return None

        if "dimension_type" not in self.df.columns:
            logger.warning("DataFrame missing 'dimension_type' column")
            return None

        # Filter to the requested dimension
        dim_df = self.df.filter(pl.col("dimension_type") == dimension)
        if dim_df.is_empty():
            logger.info(f"No data for dimension: {dimension}")
            return None

        # Determine currency
        if currency is None:
            if "currency" in dim_df.columns:
                currencies = dim_df["currency"].unique().to_list()
                currency = currencies[0] if currencies else "USD"
            else:
                currency = "USD"

        # Aggregate by dimension value
        agg_df = dim_df.group_by("dimension_value").agg([
            pl.col("spend").fill_null(0).sum().alias("spend"),
            pl.col("conversions_primary").fill_null(0).sum().alias("conversions"),
        ])

        # Calculate totals
        total_spend = agg_df["spend"].sum()
        total_conversions = agg_df["conversions"].sum()

        if total_spend == 0:
            return None

        # Build segments
        segments = []
        for row in agg_df.iter_rows(named=True):
            spend = float(row["spend"])
            conversions = float(row["conversions"])
            spend_pct = (spend / total_spend * 100) if total_spend > 0 else 0
            conv_pct = (conversions / total_conversions * 100) if total_conversions > 0 else 0
            cpl = spend / conversions if conversions > 0 else None
            efficiency = conv_pct / spend_pct if spend_pct > 0 else 0

            segments.append(CompositionSegment(
                dimension_value=row["dimension_value"],
                spend=spend,
                spend_pct=spend_pct,
                conversions=conversions,
                conversions_pct=conv_pct,
                cpl=cpl,
                efficiency_ratio=efficiency,
            ))

        # Sort by spend descending
        segments.sort(key=lambda s: s.spend, reverse=True)

        return CompositionBreakdown(
            dimension_type=dimension,
            segments=segments,
            total_spend=total_spend,
            total_conversions=total_conversions,
            currency=currency,
        )

    def detect_shifts(
        self,
        current: CompositionBreakdown,
        previous: CompositionBreakdown,
    ) -> List[CompositionShift]:
        """Detect ALL composition shifts between periods.

        Returns every shift with its raw magnitude -- no threshold filtering.
        The LLM decides what is significant.
        """
        if not current or not previous:
            return []

        if current.dimension_type != previous.dimension_type:
            logger.warning("Cannot compare different dimension types")
            return []

        shifts: List[CompositionShift] = []

        # Build lookup for previous period
        prev_lookup = {s.dimension_value: s for s in previous.segments}

        for curr_segment in current.segments:
            prev_segment = prev_lookup.get(curr_segment.dimension_value)

            if prev_segment:
                # Calculate shift magnitude
                spend_shift = abs(curr_segment.spend_pct - prev_segment.spend_pct)
                conv_shift = abs(curr_segment.conversions_pct - prev_segment.conversions_pct)

                # Use the larger of the two shifts
                shift_magnitude = max(spend_shift, conv_shift)

                # Determine direction based on spend shift
                direction = "increased" if curr_segment.spend_pct > prev_segment.spend_pct else "decreased"

                estimated_impact = self._estimate_shift_impact(
                    curr_segment, prev_segment, current, previous
                )

                quality_signal = self._determine_quality_signal(
                    curr_segment, prev_segment
                )

                shifts.append(CompositionShift(
                    dimension_type=current.dimension_type,
                    dimension_value=curr_segment.dimension_value,
                    previous_spend_pct=prev_segment.spend_pct,
                    previous_conv_pct=prev_segment.conversions_pct,
                    previous_cpl=prev_segment.cpl,
                    current_spend_pct=curr_segment.spend_pct,
                    current_conv_pct=curr_segment.conversions_pct,
                    current_cpl=curr_segment.cpl,
                    shift_magnitude=shift_magnitude,
                    direction=direction,
                    estimated_impact=estimated_impact,
                    quality_signal=quality_signal,
                ))

        # Segments that disappeared (present in previous, absent in current)
        curr_lookup = {s.dimension_value: s for s in current.segments}
        for prev_segment in previous.segments:
            if prev_segment.dimension_value not in curr_lookup:
                shifts.append(CompositionShift(
                    dimension_type=previous.dimension_type,
                    dimension_value=prev_segment.dimension_value,
                    previous_spend_pct=prev_segment.spend_pct,
                    previous_conv_pct=prev_segment.conversions_pct,
                    previous_cpl=prev_segment.cpl,
                    current_spend_pct=0.0,
                    current_conv_pct=0.0,
                    current_cpl=None,
                    shift_magnitude=prev_segment.spend_pct,
                    direction="decreased",
                    estimated_impact=0.0,
                    quality_signal="neutral",
                ))

        # Sort by magnitude descending
        shifts.sort(key=lambda s: s.shift_magnitude, reverse=True)

        return shifts

    def _estimate_shift_impact(
        self,
        curr_segment: CompositionSegment,
        prev_segment: CompositionSegment,
        current: CompositionBreakdown,
        previous: CompositionBreakdown,
    ) -> float:
        """Estimate the CPL impact of a composition shift."""
        curr_overall_cpl = (
            current.total_spend / current.total_conversions
            if current.total_conversions > 0 else 0
        )

        if prev_segment.cpl is None or curr_segment.cpl is None:
            return 0.0

        # Weight change * segment CPL difference
        weight_change = (curr_segment.spend_pct - prev_segment.spend_pct) / 100
        segment_cpl = curr_segment.cpl
        avg_cpl = curr_overall_cpl

        # If segment CPL is higher than average and weight increased, that hurts overall CPL
        if segment_cpl > 0 and avg_cpl > 0:
            return weight_change * (segment_cpl - avg_cpl)

        return 0.0

    def _determine_quality_signal(
        self,
        curr_segment: CompositionSegment,
        prev_segment: CompositionSegment,
    ) -> str:
        """Determine if the shift is positive, negative, or neutral for quality."""
        curr_efficiency = curr_segment.efficiency_ratio
        prev_efficiency = prev_segment.efficiency_ratio

        # If efficiency improved significantly
        if curr_efficiency > prev_efficiency * 1.1:
            if curr_segment.spend_pct > prev_segment.spend_pct:
                return "positive"

        # If efficiency declined significantly
        if curr_efficiency < prev_efficiency * 0.9:
            if curr_segment.spend_pct > prev_segment.spend_pct:
                return "negative"

        return "neutral"

    def calculate_efficiency(
        self,
        breakdown: CompositionBreakdown,
    ) -> Dict[str, float]:
        """Calculate efficiency metrics for a breakdown."""
        if not breakdown or not breakdown.segments:
            return {}

        return {
            segment.dimension_value: segment.efficiency_ratio
            for segment in breakdown.segments
        }

    def estimate_quality_impact(
        self,
        shifts: List[CompositionShift],
    ) -> float:
        """Estimate the overall quality impact of composition shifts."""
        if not shifts:
            return 0.0

        total_impact = 0.0
        for shift in shifts:
            if shift.quality_signal == "negative":
                total_impact += shift.estimated_impact
            elif shift.quality_signal == "positive":
                total_impact -= abs(shift.estimated_impact)

        return total_impact

    def analyze_all_dimensions(
        self,
        currency: Optional[str] = None,
    ) -> Dict[str, Optional[CompositionBreakdown]]:
        """Analyze all available dimensions."""
        if self.df.is_empty() or "dimension_type" not in self.df.columns:
            return {}

        dimensions = self.df["dimension_type"].unique().to_list()
        return {
            dimension: self.analyze_dimension(dimension, currency)
            for dimension in dimensions
        }

    @staticmethod
    def handle_missing_data(
        breakdown: Optional[CompositionBreakdown],
    ) -> Optional[CompositionBreakdown]:
        """Handle missing dimension data gracefully."""
        if breakdown is None:
            return None

        if not breakdown.segments:
            return None

        return breakdown
