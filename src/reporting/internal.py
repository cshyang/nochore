"""Internal markdown report generator optimized for diagnostics and LLM parsing."""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..models import (
    Anomaly,
    BudgetRec,
    CompositionBreakdown,
    CompositionShift,
    Forecast,
    Investigation,
    LostISInsight,
    LowQSAlert,
    MatchTypeBreakdown,
    NegativeKeywordRec,
    QSChange,
    Recommendation,
    TopSearchTerm,
    TrendResult,
)
from .formatting import (
    escape_table_cell,
    format_change,
    format_count,
    format_pct,
    format_money,
    metric_label,
)

logger = logging.getLogger(__name__)


class InternalReportGenerator:
    """Generate the verbose internal markdown report."""

    def __init__(self, output_dir: str = "reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
    
    def generate_report(
        self,
        client_id: str,
        period: str,
        kpi_summary: Dict[str, Any],
        neg_keywords: List[NegativeKeywordRec],
        top_search_terms: List[TopSearchTerm],
        match_type_breakdown: List[MatchTypeBreakdown],
        lost_is: List[LostISInsight],
        budget_recs: List[BudgetRec],
        qs_changes: List[QSChange],
        low_qs_alerts: List[LowQSAlert],
        qs_distribution: Dict[str, int],
        trends: List[TrendResult],
        anomalies: List[Anomaly],
        forecast: List[Forecast],
        # New diagnostic parameters
        cpl_investigation: Optional[Investigation] = None,
        cvr_investigation: Optional[Investigation] = None,
        volume_investigation: Optional[Investigation] = None,
        composition_device: Optional[CompositionBreakdown] = None,
        composition_geo: Optional[CompositionBreakdown] = None,
        composition_hour: Optional[CompositionBreakdown] = None,
        composition_shifts: Optional[List[CompositionShift]] = None,
        search_term_trends: Optional[List[Dict[str, Any]]] = None,
        junk_ratio: Optional[Dict[str, Any]] = None,
    ) -> Path:
        """Generate complete markdown report."""

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        filename = f"{client_id}_{period.replace(' ', '-')}.md"
        file_path = self.output_dir / filename

        with open(file_path, "w") as f:
            # Header
            f.write(f"# {client_id} - Ads Performance Report\n")
            f.write(f"**Period:** {period}\n")
            f.write(f"**Generated:** {timestamp}\n\n")
            f.write("---\n\n")

            # Executive Summary
            f.write(self._format_executive_summary(kpi_summary))

            # Root Cause Investigation (new)
            if any([cpl_investigation, cvr_investigation, volume_investigation]):
                f.write(self._format_investigation_section(
                    cpl_investigation, cvr_investigation, volume_investigation,
                    kpi_summary.get("currency", "USD")
                ))

            # Composition Analysis (new)
            if any([composition_device, composition_geo, composition_hour, composition_shifts]):
                f.write(self._format_composition_section(
                    composition_device, composition_geo, composition_hour,
                    composition_shifts or []
                ))

            # Search Terms Analysis
            f.write(self._format_search_terms_section(neg_keywords, top_search_terms, match_type_breakdown))

            # Search Term Trends (new)
            if search_term_trends or junk_ratio:
                f.write(self._format_search_term_trends_section(search_term_trends or [], junk_ratio))

            # Impression Share Analysis
            f.write(self._format_impression_share_section(lost_is, budget_recs))

            # Quality Score Trends
            f.write(self._format_quality_score_section(qs_changes, low_qs_alerts, qs_distribution))

            # Trends & Forecasting
            f.write(self._format_trends_section(trends, anomalies, forecast))

            # Recommendations (new)
            all_recs = []
            if cpl_investigation:
                all_recs.extend(cpl_investigation.recommendations)
            if cvr_investigation:
                all_recs.extend(cvr_investigation.recommendations)
            if volume_investigation:
                all_recs.extend(volume_investigation.recommendations)
            if all_recs:
                f.write(self._format_recommendations_section(all_recs, kpi_summary.get("currency", "USD")))

            # Notes & Caveats
            f.write(self._format_notes(neg_keywords, lost_is, low_qs_alerts))

            # Footer
            f.write("---\n\n")
            f.write("**Data Sources:** Google Ads API, Meta Ads API\n")
            f.write("**Report Version:** 3.0 (Diagnostic Tree)\n")

        logger.info("Generated markdown report: %s", file_path)
        return file_path

    
    def _format_executive_summary(self, kpi: Dict[str, Any]) -> str:
        """Format executive summary section (lead-gen focused)."""
        out = "## Executive Summary\n\n"

        current_period = kpi.get("period_current")
        previous_period = kpi.get("period_previous")
        if current_period:
            out += f"**Current Period:** {escape_table_cell(current_period)}\n"
        if previous_period:
            out += f"**Previous Period:** {escape_table_cell(previous_period)}\n"
        if current_period or previous_period:
            out += "\n"

        out += "**Lead Definitions (for this report):**\n"
        out += '- **Primary Leads:** Google Ads "Conversions" (GA4 imported conversions set as Primary) + Meta messaging conversations started (Messenger/IG/WhatsApp)\n'
        out += '- **Secondary Conversions (Google):** Google Ads "All conversions" minus "Conversions"\n\n'

        # KPI Table (currency-agnostic)
        out += "| Metric | Current Period | Previous Period | Change |\n"
        out += "|--------|----------------|-----------------|--------|\n"
        out += f"| Impressions | {format_count(kpi.get('impressions_current'))} | {format_count(kpi.get('impressions_previous'))} | {format_change(kpi.get('impressions_change'))} |\n"
        out += f"| Clicks | {format_count(kpi.get('clicks_current'))} | {format_count(kpi.get('clicks_previous'))} | {format_change(kpi.get('clicks_change'))} |\n"
        out += f"| CTR | {format_pct(kpi.get('ctr_current'))} | {format_pct(kpi.get('ctr_previous'))} | {format_change(kpi.get('ctr_change'))} |\n"
        out += f"| Primary Leads | {format_count(kpi.get('leads_primary_current'))} | {format_count(kpi.get('leads_primary_previous'))} | {format_change(kpi.get('leads_primary_change'))} |\n"
        out += f"| CVR (Leads/Clicks) | {format_pct(kpi.get('cvr_current'))} | {format_pct(kpi.get('cvr_previous'))} | {format_change(kpi.get('cvr_change'))} |\n"
        out += f"| Secondary Conversions (Google) | {format_count(kpi.get('conversions_secondary_current'))} | {format_count(kpi.get('conversions_secondary_previous'))} | {format_change(kpi.get('conversions_secondary_change'))} |\n\n"

        # Currency breakdown (never mix currencies)
        currency_current = {str(r.get("currency")): r for r in (kpi.get("currency_breakdown_current") or []) if r.get("currency")}
        currency_previous = {str(r.get("currency")): r for r in (kpi.get("currency_breakdown_previous") or []) if r.get("currency")}
        currencies = sorted(set(currency_current.keys()) | set(currency_previous.keys()))

        if currencies:
            out += "### Currency Breakdown (Primary Leads)\n\n"
            out += "| Currency | Spend (Cur) | Spend (Prev) | Clicks (Cur) | Leads (Cur) | CPC (Cur) | CPL (Cur) |\n"
            out += "|----------|-------------|--------------|--------------|-------------|----------|----------|\n"
            for currency in currencies:
                cur = currency_current.get(currency, {})
                spend_cur = float(cur.get("spend") or 0)
                clicks_cur = float(cur.get("clicks") or 0)
                leads_cur = float(cur.get("leads_primary") or 0)
                cpc_cur = (spend_cur / clicks_cur) if clicks_cur > 0 else None
                cpl_cur = (spend_cur / leads_cur) if leads_cur > 0 else None

                prev = currency_previous.get(currency, {})
                spend_prev = float(prev.get("spend") or 0)

                cpc_str = "N/A" if cpc_cur is None else format_money(currency, cpc_cur)
                cpl_str = "N/A" if cpl_cur is None else format_money(currency, cpl_cur)
                out += (
                    f"| {escape_table_cell(currency)} | {format_money(currency, spend_cur)} | {format_money(currency, spend_prev)} |"
                    f" {format_count(clicks_cur)} | {format_count(leads_cur)} | {cpc_str} | {cpl_str} |\n"
                )
            out += "\n"

        # Platform + currency breakdown (current period)
        platform_rows = kpi.get("platform_currency_breakdown_current") or []
        if platform_rows:
            out += "### Platform Breakdown (Current Period)\n\n"
            out += "| Platform | Currency | Spend | Clicks | Primary Leads | Secondary Conv (G) | CPC | CPL |\n"
            out += "|----------|----------|-------|--------|--------------|--------------------|-----|-----|\n"
            for row in platform_rows:
                platform = escape_table_cell(row.get("platform")).upper()
                currency = escape_table_cell(row.get("currency"))
                spend = float(row.get("spend") or 0)
                clicks = float(row.get("clicks") or 0)
                leads = float(row.get("leads_primary") or 0)
                secondary = float(row.get("conversions_secondary") or 0)
                cpc = (spend / clicks) if clicks > 0 else None
                cpl = (spend / leads) if leads > 0 else None

                out += (
                    f"| {platform} | {currency} | {format_money(currency, spend)} | {format_count(clicks)} | {format_count(leads)} |"
                    f" {format_count(secondary)} | {'N/A' if cpc is None else format_money(currency, cpc)} | {'N/A' if cpl is None else format_money(currency, cpl)} |\n"
                )
            out += "\n"

        # Key Findings
        out += "**Key Notes:**\n"
        findings = kpi.get("findings", [])
        for i, finding in enumerate(findings[:3], 1):
            out += f"{i}. {finding}\n"
        out += "\n---\n\n"

        return out
    
    def _format_search_terms_section(self, neg_kw: List[NegativeKeywordRec],
                                     top_terms: List[TopSearchTerm],
                                     match_breakdown: List[MatchTypeBreakdown]) -> str:
        """Format search terms analysis section (Google Ads only)."""
        out = "## 1. Search Terms (Google Ads)\n\n"

        # Negative Keywords
        out += "### Search Terms With Spend and No Primary Leads (Review)\n\n"
        
        high_priority = [n for n in neg_kw if n.reason == "high_spend_no_conv"]
        if high_priority:
            out += "**High Spend**\n\n"
            out += "| Currency | Search Term | Campaign | Spend | Clicks | Primary Leads | Note |\n"
            out += "|----------|-------------|----------|-------|--------|--------------|------|\n"
            for nk in high_priority[:10]:
                currency = escape_table_cell(nk.currency)
                term = escape_table_cell(nk.search_term)
                campaign = escape_table_cell(nk.campaign)
                note = escape_table_cell(nk.note)
                out += (
                    f"| {currency} | {term} | {campaign} | {format_money(currency, nk.spend)} | {format_count(nk.clicks)} |"
                    f" {format_count(nk.leads)} | {note} |\n"
                )
            out += "\n"
        
        med_priority = [n for n in neg_kw if n.reason == "low_ctr"]
        if med_priority:
            out += "**Low CTR**\n\n"
            out += "| Currency | Search Term | Campaign | Spend | Clicks | Primary Leads | Note |\n"
            out += "|----------|-------------|----------|-------|--------|--------------|------|\n"
            for nk in med_priority[:10]:
                currency = escape_table_cell(nk.currency)
                term = escape_table_cell(nk.search_term)
                campaign = escape_table_cell(nk.campaign)
                note = escape_table_cell(nk.note)
                out += (
                    f"| {currency} | {term} | {campaign} | {format_money(currency, nk.spend)} | {format_count(nk.clicks)} |"
                    f" {format_count(nk.leads)} | {note} |\n"
                )
            out += "\n"
        
        # Top Performers
        if top_terms:
            out += "### Top Search Terms (Primary Leads)\n\n"
            out += "| Currency | Search Term | Campaign | Spend | Clicks | Primary Leads | CVR | CPL | Note |\n"
            out += "|----------|-------------|----------|-------|--------|--------------|-----|-----|------|\n"
            for term in top_terms[:10]:
                currency = escape_table_cell(term.currency)
                search_term = escape_table_cell(term.search_term)
                campaign = escape_table_cell(term.campaign)
                cvr = format_pct(term.cvr, 1)
                cpl = "N/A" if term.cpl is None else format_money(currency, term.cpl)
                note = escape_table_cell(term.note)
                out += (
                    f"| {currency} | {search_term} | {campaign} | {format_money(currency, term.spend)} | {format_count(term.clicks)} |"
                    f" {format_count(term.leads)} | {cvr} | {cpl} | {note} |\n"
                )
            out += "\n"
        
        # Match Type Distribution
        if match_breakdown:
            out += "### Match Type Distribution\n\n"
            out += "| Match Type | Spend % | Leads % | Efficiency |\n"
            out += "|------------|---------|--------------|------------|\n"
            for mb in match_breakdown:
                match_type = escape_table_cell(mb.match_type)
                out += f"| {match_type} | {mb.spend_pct:.1f}% | {mb.conversion_pct:.1f}% | {mb.efficiency_ratio:.2f} |\n"
            out += "\n"
        
        out += "---\n\n"
        return out
    
    def _format_impression_share_section(self, lost_is: List[LostISInsight],
                                        budget_recs: List[BudgetRec]) -> str:
        """Format impression share analysis section."""
        out = "## 2. Search Impression Share (Google Ads)\n\n"
        
        if lost_is:
            out += "### Low Search Impression Share (Primary Leads Impact)\n\n"
            out += "| Campaign | Search IS | Lost to Budget | Lost to Rank | Primary Driver |\n"
            out += "|----------|------------|----------------|--------------|--------|\n"
            for insight in lost_is[:10]:
                campaign = escape_table_cell(insight.campaign)
                action = escape_table_cell(insight.action)
                out += f"| {campaign} | {insight.current_is:.1f}% | {insight.lost_to_budget:.1f}% | {insight.lost_to_rank:.1f}% | {action} |\n"
            out += "\n"
        
        out += "---\n\n"
        return out
    
    def _format_quality_score_section(self, qs_changes: List[QSChange],
                                      low_qs: List[LowQSAlert],
                                      distribution: Dict[str, int]) -> str:
        """Format quality score trends section."""
        out = "## 3. Quality Score Diagnostics (Google Ads)\n\n"
        out += "_Note: Quality Score components are diagnostic signals. Landing Page Experience and Expected CTR are system-estimated and may have limited direct levers._\n\n"

        # QS Changes
        if qs_changes:
            improved = [c for c in qs_changes if c.change_direction == "improved"]
            declined = [c for c in qs_changes if c.change_direction == "declined"]
            
            if improved:
                out += "### QS Changes This Month\n\n**Improved**\n\n"
                out += "| Keyword | Campaign | Previous | Current | Component |\n"
                out += "|---------|----------|----------|---------|-----------|\n"
                for change in improved[:5]:
                    keyword = escape_table_cell(change.keyword)
                    campaign = escape_table_cell(change.campaign)
                    comp = change.component_issue or "Overall"
                    comp = escape_table_cell(comp)
                    out += f"| {keyword} | {campaign} | {change.previous_qs} | {change.current_qs} | {comp} |\n"
                out += "\n"
            
            if declined:
                out += "**Declined**\n\n"
                out += "| Keyword | Campaign | Previous | Current | Issue |\n"
                out += "|---------|----------|----------|---------|-------|\n"
                for change in declined[:5]:
                    keyword = escape_table_cell(change.keyword)
                    campaign = escape_table_cell(change.campaign)
                    issue = change.component_issue or "Review all components"
                    issue = escape_table_cell(issue)
                    out += f"| {keyword} | {campaign} | {change.previous_qs} | {change.current_qs} | {issue} |\n"
                out += "\n"
        
        # Low QS Alerts
        if low_qs:
            out += "### Low QS Alerts\n\n"
            out += "Keywords with QS ≤ 5 and significant spend (diagnostic list):\n\n"
            out += "| Currency | Keyword | Campaign | QS | Spend | Landing Page | Ad Rel | Expected CTR |\n"
            out += "|----------|---------|----------|----|-------|--------------|--------|--------------|\n"
            for alert in low_qs[:10]:
                currency = escape_table_cell(alert.currency)
                keyword = escape_table_cell(alert.keyword)
                campaign = escape_table_cell(alert.campaign)
                landing_page = escape_table_cell(alert.landing_page)
                ad_relevance = escape_table_cell(alert.ad_relevance)
                expected_ctr = escape_table_cell(alert.expected_ctr)
                out += (
                    f"| {currency} | {keyword} | {campaign} | {alert.quality_score} | {format_money(currency, alert.spend)} |"
                    f" {landing_page} | {ad_relevance} | {expected_ctr} |\n"
                )
            out += "\n"
        
        # Distribution
        if distribution:
            total = sum(distribution.values())
            out += "### Distribution\n\n"
            out += "| QS Range | Keywords | Percentage |\n"
            out += "|----------|----------|------------|\n"
            for range_name, count in [("8-10", distribution.get("8-10", 0)),
                                     ("5-7", distribution.get("5-7", 0)),
                                     ("1-4", distribution.get("1-4", 0))]:
                pct = (count / total * 100) if total > 0 else 0
                out += f"| {range_name} | {count} | {pct:.1f}% |\n"
            out += "\n"
        
        out += "---\n\n"
        return out
    
    def _format_trends_section(self, trends: List[TrendResult],
                               anomalies: List[Anomaly],
                               forecasts: List[Forecast]) -> str:
        """Format trends and forecasting section."""
        out = "## 4. Trends & Forecasting\n\n"

        if trends:
            out += "### Performance Trends\n\n"
            out += "| Metric | Trend | Rate | Significance |\n"
            out += "|--------|-------|------|--------------|\n"
            for trend in trends:
                metric = escape_table_cell(metric_label(trend.metric))
                arrow = "↑" if trend.direction == "up" else "↓" if trend.direction == "down" else "→"
                out += f"| {metric} | {arrow} {trend.direction} | {trend.rate_per_day:+.2f}/day | {trend.significance} |\n"
            out += "\n"
        
        if anomalies:
            out += "### Anomalies Detected\n\n"
            out += "| Date | Campaign | Metric | Expected | Actual | Severity |\n"
            out += "|------|----------|--------|----------|--------|----------|\n"
            for anomaly in anomalies[:10]:
                campaign = escape_table_cell(anomaly.campaign)
                metric = escape_table_cell(metric_label(anomaly.metric))
                out += f"| {anomaly.date} | {campaign} | {metric} | {anomaly.expected:.2f} | {anomaly.actual:.2f} | {anomaly.severity.upper()} |\n"
            out += "\n"
        
        if forecasts:
            out += "### 7-Day Forecast\n\n"
            out += "| Metric | Projected | Confidence Interval |\n"
            out += "|--------|-----------|---------------------|\n"
            for fc in forecasts:
                out += f"| {metric_label(fc.metric)} | {fc.projected_value:.2f} | ({fc.confidence_interval[0]:.2f}, {fc.confidence_interval[1]:.2f}) |\n"
            out += "\n"
        
        out += "---\n\n"
        return out
    
    def _format_notes(
        self,
        neg_kw: List[NegativeKeywordRec],
        lost_is: List[LostISInsight],
        low_qs: List[LowQSAlert],
    ) -> str:
        """Format neutral notes/caveats (no promised impact)."""
        out = "## 5. Notes & Caveats\n\n"

        out += "| Item | Value |\n"
        out += "|------|-------|\n"
        out += f"| Search term signals (no-lead candidates) | {len(neg_kw):,} |\n"
        out += f"| Low search impression share campaigns | {len(lost_is):,} |\n"
        out += f"| Low quality score keywords (high spend) | {len(low_qs):,} |\n"
        out += "\n"

        out += "**Interpretation Notes:**\n"
        out += "- Monetary metrics (Spend/CPC/CPL/CPM) are shown per currency to avoid mixed-currency totals.\n"
        out += "- Quality Score components are diagnostic signals; improvements are not guaranteed and may have limited direct levers.\n"
        out += "- Secondary conversions are available for Google Ads only (All conversions − Conversions).\n\n"

        return out

    def _format_investigation_section(
        self,
        cpl_investigation: Optional[Investigation],
        cvr_investigation: Optional[Investigation],
        volume_investigation: Optional[Investigation],
        currency: str,
    ) -> str:
        """Format root cause investigation section."""
        out = "## Root Cause Investigation\n\n"

        investigations = []
        if cpl_investigation and cpl_investigation.triggered:
            investigations.append(("CPL", cpl_investigation))
        if cvr_investigation and cvr_investigation.triggered:
            investigations.append(("CVR", cvr_investigation))
        if volume_investigation and volume_investigation.triggered:
            investigations.append(("Volume", volume_investigation))

        if not investigations:
            out += "_No significant metric changes detected that triggered investigation._\n\n"
            out += "---\n\n"
            return out

        for metric_name, investigation in investigations:
            out += f"### {investigation.metric_name} Investigation\n\n"

            # Change summary
            direction = "increased" if investigation.change_absolute > 0 else "decreased"
            out += f"**Status:** TRIGGERED\n"
            out += f"**Change:** {investigation.previous_value:.2f} → {investigation.current_value:.2f} "
            out += f"({investigation.change_pct:+.1f}%, {direction})\n"
            out += f"**Threshold:** ±{investigation.threshold:.0f}%\n\n"

            # Diagnoses
            if investigation.diagnoses:
                out += "#### Confirmed Diagnoses\n\n"
                out += "| Check | Confidence | Impact | Evidence |\n"
                out += "|-------|------------|--------|----------|\n"
                for diagnosis in investigation.diagnoses:
                    evidence_summary = ", ".join(
                        e.metric for e in diagnosis.evidence[:3] if e.passed
                    )
                    out += (
                        f"| {escape_table_cell(diagnosis.check_name)} | "
                        f"{diagnosis.confidence.upper()} ({diagnosis.confidence_score:.0%}) | "
                        f"{currency} {diagnosis.estimated_impact:.2f} | "
                        f"{escape_table_cell(evidence_summary)} |\n"
                    )
                out += "\n"
                out += f"**Attribution Accuracy:** {investigation.attribution_accuracy:.0%} of change explained\n\n"
            else:
                out += "_Investigation inconclusive - no root causes confirmed._\n\n"

        out += "---\n\n"
        return out

    def _format_composition_section(
        self,
        device: Optional[CompositionBreakdown],
        geo: Optional[CompositionBreakdown],
        hour: Optional[CompositionBreakdown],
        shifts: List[CompositionShift],
    ) -> str:
        """Format composition analysis section."""
        out = "## Composition Analysis\n\n"

        def format_breakdown(title: str, breakdown: CompositionBreakdown) -> str:
            section = f"### {title} Breakdown\n\n"
            section += f"**Total Spend:** {breakdown.currency} {breakdown.total_spend:,.2f} | "
            section += f"**Total Conversions:** {breakdown.total_conversions:,.1f}\n\n"

            section += "| Segment | Spend | Spend % | Conv | Conv % | CPL | Efficiency |\n"
            section += "|---------|-------|---------|------|--------|-----|------------|\n"

            for seg in breakdown.segments[:8]:
                cpl_str = f"{breakdown.currency} {seg.cpl:.2f}" if seg.cpl else "N/A"
                section += (
                    f"| {escape_table_cell(seg.dimension_value)} | "
                    f"{breakdown.currency} {seg.spend:,.2f} | "
                    f"{seg.spend_pct:.1f}% | "
                    f"{seg.conversions:,.1f} | "
                    f"{seg.conversions_pct:.1f}% | "
                    f"{cpl_str} | "
                    f"{seg.efficiency_ratio:.2f} |\n"
                )
            section += "\n"
            return section

        if device:
            out += format_breakdown("Device", device)
        if geo:
            out += format_breakdown("Geography", geo)
        if hour:
            out += format_breakdown("Hour of Day", hour)

        if shifts:
            out += "### Significant Composition Shifts\n\n"
            out += "| Dimension | Value | Previous % | Current % | Shift | Signal |\n"
            out += "|-----------|-------|------------|-----------|-------|--------|\n"
            for shift in shifts[:10]:
                signal_emoji = {"positive": "✓", "negative": "✗", "neutral": "○"}.get(
                    shift.quality_signal, "○"
                )
                out += (
                    f"| {escape_table_cell(shift.dimension_type)} | "
                    f"{escape_table_cell(shift.dimension_value)} | "
                    f"{shift.previous_spend_pct:.1f}% | "
                    f"{shift.current_spend_pct:.1f}% | "
                    f"{shift.shift_magnitude:+.1f}pts | "
                    f"{signal_emoji} {shift.quality_signal} |\n"
                )
            out += "\n"

        if not any([device, geo, hour, shifts]):
            out += "_No dimension breakdown data available._\n\n"

        out += "---\n\n"
        return out

    def _format_recommendations_section(
        self,
        recommendations: List[Recommendation],
        currency: str,
    ) -> str:
        """Format recommendations section."""
        out = "## Action Queue\n\n"

        if not recommendations:
            out += "_No actionable recommendations at this time._\n\n"
            out += "---\n\n"
            return out

        # Sort by priority
        sorted_recs = sorted(recommendations, key=lambda r: (r.priority, -r.expected_impact))

        out += "| Priority | Action | Expected Impact | Effort | Confidence |\n"
        out += "|----------|--------|-----------------|--------|------------|\n"

        for rec in sorted_recs[:15]:
            impact_str = f"{currency} {rec.expected_impact:.2f} {rec.impact_unit}"
            out += (
                f"| P{rec.priority} | "
                f"{escape_table_cell(rec.title)} | "
                f"{impact_str} | "
                f"{rec.effort.upper()} | "
                f"{rec.confidence.upper()} |\n"
            )

        out += "\n### Details\n\n"
        for rec in sorted_recs[:10]:
            out += f"**{rec.action_id}: {rec.title}**\n"
            out += f"- {rec.description}\n"
            if rec.affected_items:
                out += f"- Affected: {', '.join(rec.affected_items[:5])}\n"
            out += "\n"

        out += "---\n\n"
        return out

    def _format_search_term_trends_section(
        self,
        trends: List[Dict[str, Any]],
        junk_ratio: Optional[Dict[str, Any]],
    ) -> str:
        """Format search term trends section."""
        out = "## Search Term Quality Trends\n\n"

        # Junk ratio
        if junk_ratio:
            status_emoji = {
                "improved": "✓",
                "worsened": "✗",
                "stable": "○"
            }.get(junk_ratio.get("status", "stable"), "○")

            out += "### Wasted Spend Analysis\n\n"
            out += "| Metric | Current | Previous | Change |\n"
            out += "|--------|---------|----------|--------|\n"
            out += (
                f"| Zero-Conversion Spend % | "
                f"{junk_ratio.get('current_junk_ratio', 0):.1f}% | "
                f"{junk_ratio.get('previous_junk_ratio', 0):.1f}% | "
                f"{junk_ratio.get('change', 0):+.1f}pts {status_emoji} |\n"
            )
            out += "\n"

        # Term trends
        if trends:
            # Emerging terms
            emerging = [t for t in trends if t.get("is_emerging") or t.get("trend") == "emerging"]
            if emerging:
                out += "### Emerging Search Terms\n\n"
                out += "| Search Term | Campaign | Spend | Conversions |\n"
                out += "|-------------|----------|-------|-------------|\n"
                for term in emerging[:10]:
                    currency = term.get("currency", "USD")
                    out += (
                        f"| {escape_table_cell(term.get('search_term', ''))} | "
                        f"{escape_table_cell(term.get('campaign', ''))} | "
                        f"{currency} {term.get('current_spend', 0):,.2f} | "
                        f"{term.get('current_conversions', 0):,.1f} |\n"
                    )
                out += "\n"

            # Declining terms
            declining = [t for t in trends if t.get("trend") == "declining"]
            if declining:
                out += "### Declining Search Terms\n\n"
                out += "| Search Term | Previous Conv | Current Conv | Trend |\n"
                out += "|-------------|---------------|--------------|-------|\n"
                for term in declining[:10]:
                    out += (
                        f"| {escape_table_cell(term.get('search_term', ''))} | "
                        f"{term.get('previous_conversions', 0):,.1f} | "
                        f"{term.get('current_conversions', 0):,.1f} | "
                        f"↓ declining |\n"
                    )
                out += "\n"

        if not trends and not junk_ratio:
            out += "_No search term trend data available._\n\n"

        out += "---\n\n"
        return out


MarkdownReportGenerator = InternalReportGenerator

__all__ = ["InternalReportGenerator", "MarkdownReportGenerator"]
