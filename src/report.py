"""Markdown report generator optimized for LLM parsing."""
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from .data_models import (
    NegativeKeywordRec, TopSearchTerm, MatchTypeBreakdown,
    LostISInsight, BudgetRec,
    QSChange, LowQSAlert,
    TrendResult, Anomaly, Forecast
)

logger = logging.getLogger(__name__)

class MarkdownReportGenerator:
    """Generates structured markdown reports for AI consumption."""
    
    def __init__(self, output_dir: str = "monthly_summaries"):
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

            # Search Terms Analysis
            f.write(self._format_search_terms_section(neg_keywords, top_search_terms, match_type_breakdown))

            # Impression Share Analysis
            f.write(self._format_impression_share_section(lost_is, budget_recs))

            # Quality Score Trends
            f.write(self._format_quality_score_section(qs_changes, low_qs_alerts, qs_distribution))

            # Trends & Forecasting
            f.write(self._format_trends_section(trends, anomalies, forecast))

            # Notes & Caveats
            f.write(self._format_notes(neg_keywords, lost_is, low_qs_alerts))

            # Footer
            f.write("---\n\n")
            f.write("**Data Sources:** Google Ads API, Meta Ads API\n")
            f.write("**Report Version:** 2.0\n")

        logger.info("Generated markdown report: %s", file_path)
        return file_path

    @staticmethod
    def _escape_table_cell(value: Any) -> str:
        """Escape values for safe inclusion in markdown tables."""
        if value is None:
            return ""

        text = str(value)
        text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", " ")
        text = text.replace("|", "\\|")
        return text.strip()
    
    def _format_executive_summary(self, kpi: Dict[str, Any]) -> str:
        """Format executive summary section (lead-gen focused)."""
        out = "## Executive Summary\n\n"

        current_period = kpi.get("period_current")
        previous_period = kpi.get("period_previous")
        if current_period:
            out += f"**Current Period:** {self._escape_table_cell(current_period)}\n"
        if previous_period:
            out += f"**Previous Period:** {self._escape_table_cell(previous_period)}\n"
        if current_period or previous_period:
            out += "\n"

        out += "**Lead Definitions (for this report):**\n"
        out += "- **Primary Leads:** Google Ads “Conversions” (GA4 imported conversions set as Primary) + Meta messaging conversations started (Messenger/IG/WhatsApp)\n"
        out += "- **Secondary Conversions (Google):** Google Ads “All conversions” minus “Conversions”\n\n"

        def format_change(pct: Any) -> str:
            if pct is None:
                return "N/A"
            try:
                return f"{float(pct):+.1f}%"
            except Exception:
                return "N/A"

        def format_count(value: Any) -> str:
            if value is None:
                return "0"
            try:
                num = float(value)
            except Exception:
                return str(value)
            if abs(num - round(num)) < 1e-6:
                return f"{int(round(num)):,}"
            return f"{num:,.1f}"

        def format_pct(value: Any, digits: int = 2) -> str:
            if value is None:
                return "N/A"
            try:
                return f"{float(value):.{digits}f}%"
            except Exception:
                return "N/A"

        def money(currency: str, amount: Any) -> str:
            try:
                return f"{currency} {float(amount):,.2f}"
            except Exception:
                return f"{currency} 0.00"

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

                cpc_str = "N/A" if cpc_cur is None else money(currency, cpc_cur)
                cpl_str = "N/A" if cpl_cur is None else money(currency, cpl_cur)
                out += (
                    f"| {self._escape_table_cell(currency)} | {money(currency, spend_cur)} | {money(currency, spend_prev)} |"
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
                platform = self._escape_table_cell(row.get("platform")).upper()
                currency = self._escape_table_cell(row.get("currency"))
                spend = float(row.get("spend") or 0)
                clicks = float(row.get("clicks") or 0)
                leads = float(row.get("leads_primary") or 0)
                secondary = float(row.get("conversions_secondary") or 0)
                cpc = (spend / clicks) if clicks > 0 else None
                cpl = (spend / leads) if leads > 0 else None

                out += (
                    f"| {platform} | {currency} | {money(currency, spend)} | {format_count(clicks)} | {format_count(leads)} |"
                    f" {format_count(secondary)} | {'N/A' if cpc is None else money(currency, cpc)} | {'N/A' if cpl is None else money(currency, cpl)} |\n"
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

        def money(currency: str, amount: Any) -> str:
            try:
                return f"{currency} {float(amount):,.2f}"
            except Exception:
                return f"{currency} 0.00"

        def format_count(value: Any) -> str:
            if value is None:
                return "0"
            try:
                num = float(value)
            except Exception:
                return str(value)
            if abs(num - round(num)) < 1e-6:
                return f"{int(round(num)):,}"
            return f"{num:,.1f}"

        def format_pct(value: Any) -> str:
            if value is None:
                return "N/A"
            try:
                return f"{float(value):.1f}%"
            except Exception:
                return "N/A"
        
        # Negative Keywords
        out += "### Search Terms With Spend and No Primary Leads (Review)\n\n"
        
        high_priority = [n for n in neg_kw if n.reason == "high_spend_no_conv"]
        if high_priority:
            out += "**High Spend**\n\n"
            out += "| Currency | Search Term | Campaign | Spend | Clicks | Primary Leads | Note |\n"
            out += "|----------|-------------|----------|-------|--------|--------------|------|\n"
            for nk in high_priority[:10]:
                currency = self._escape_table_cell(nk.currency)
                term = self._escape_table_cell(nk.search_term)
                campaign = self._escape_table_cell(nk.campaign)
                note = self._escape_table_cell(nk.note)
                out += (
                    f"| {currency} | {term} | {campaign} | {money(currency, nk.spend)} | {format_count(nk.clicks)} |"
                    f" {format_count(nk.leads)} | {note} |\n"
                )
            out += "\n"
        
        med_priority = [n for n in neg_kw if n.reason == "low_ctr"]
        if med_priority:
            out += "**Low CTR**\n\n"
            out += "| Currency | Search Term | Campaign | Spend | Clicks | Primary Leads | Note |\n"
            out += "|----------|-------------|----------|-------|--------|--------------|------|\n"
            for nk in med_priority[:10]:
                currency = self._escape_table_cell(nk.currency)
                term = self._escape_table_cell(nk.search_term)
                campaign = self._escape_table_cell(nk.campaign)
                note = self._escape_table_cell(nk.note)
                out += (
                    f"| {currency} | {term} | {campaign} | {money(currency, nk.spend)} | {format_count(nk.clicks)} |"
                    f" {format_count(nk.leads)} | {note} |\n"
                )
            out += "\n"
        
        # Top Performers
        if top_terms:
            out += "### Top Search Terms (Primary Leads)\n\n"
            out += "| Currency | Search Term | Campaign | Spend | Clicks | Primary Leads | CVR | CPL | Note |\n"
            out += "|----------|-------------|----------|-------|--------|--------------|-----|-----|------|\n"
            for term in top_terms[:10]:
                currency = self._escape_table_cell(term.currency)
                search_term = self._escape_table_cell(term.search_term)
                campaign = self._escape_table_cell(term.campaign)
                cvr = format_pct(term.cvr)
                cpl = "N/A" if term.cpl is None else money(currency, term.cpl)
                note = self._escape_table_cell(term.note)
                out += (
                    f"| {currency} | {search_term} | {campaign} | {money(currency, term.spend)} | {format_count(term.clicks)} |"
                    f" {format_count(term.leads)} | {cvr} | {cpl} | {note} |\n"
                )
            out += "\n"
        
        # Match Type Distribution
        if match_breakdown:
            out += "### Match Type Distribution\n\n"
            out += "| Match Type | Spend % | Leads % | Efficiency |\n"
            out += "|------------|---------|--------------|------------|\n"
            for mb in match_breakdown:
                match_type = self._escape_table_cell(mb.match_type)
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
                campaign = self._escape_table_cell(insight.campaign)
                action = self._escape_table_cell(insight.action)
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

        def money(currency: str, amount: Any) -> str:
            try:
                return f"{currency} {float(amount):,.2f}"
            except Exception:
                return f"{currency} 0.00"
        
        # QS Changes
        if qs_changes:
            improved = [c for c in qs_changes if c.change_direction == "improved"]
            declined = [c for c in qs_changes if c.change_direction == "declined"]
            
            if improved:
                out += "### QS Changes This Month\n\n**Improved**\n\n"
                out += "| Keyword | Campaign | Previous | Current | Component |\n"
                out += "|---------|----------|----------|---------|-----------|\n"
                for change in improved[:5]:
                    keyword = self._escape_table_cell(change.keyword)
                    campaign = self._escape_table_cell(change.campaign)
                    comp = change.component_issue or "Overall"
                    comp = self._escape_table_cell(comp)
                    out += f"| {keyword} | {campaign} | {change.previous_qs} | {change.current_qs} | {comp} |\n"
                out += "\n"
            
            if declined:
                out += "**Declined**\n\n"
                out += "| Keyword | Campaign | Previous | Current | Issue |\n"
                out += "|---------|----------|----------|---------|-------|\n"
                for change in declined[:5]:
                    keyword = self._escape_table_cell(change.keyword)
                    campaign = self._escape_table_cell(change.campaign)
                    issue = change.component_issue or "Review all components"
                    issue = self._escape_table_cell(issue)
                    out += f"| {keyword} | {campaign} | {change.previous_qs} | {change.current_qs} | {issue} |\n"
                out += "\n"
        
        # Low QS Alerts
        if low_qs:
            out += "### Low QS Alerts\n\n"
            out += "Keywords with QS ≤ 5 and significant spend (diagnostic list):\n\n"
            out += "| Currency | Keyword | Campaign | QS | Spend | Landing Page | Ad Rel | Expected CTR |\n"
            out += "|----------|---------|----------|----|-------|--------------|--------|--------------|\n"
            for alert in low_qs[:10]:
                currency = self._escape_table_cell(alert.currency)
                keyword = self._escape_table_cell(alert.keyword)
                campaign = self._escape_table_cell(alert.campaign)
                landing_page = self._escape_table_cell(alert.landing_page)
                ad_relevance = self._escape_table_cell(alert.ad_relevance)
                expected_ctr = self._escape_table_cell(alert.expected_ctr)
                out += (
                    f"| {currency} | {keyword} | {campaign} | {alert.quality_score} | {money(currency, alert.spend)} |"
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

        def metric_label(raw: str) -> str:
            if raw == "conversions_primary":
                return "primary_leads"
            if raw == "conversions_secondary":
                return "secondary_conversions_google"
            return raw
        
        if trends:
            out += "### Performance Trends\n\n"
            out += "| Metric | Trend | Rate | Significance |\n"
            out += "|--------|-------|------|--------------|\n"
            for trend in trends:
                metric = self._escape_table_cell(metric_label(trend.metric))
                arrow = "↑" if trend.direction == "up" else "↓" if trend.direction == "down" else "→"
                out += f"| {metric} | {arrow} {trend.direction} | {trend.rate_per_day:+.2f}/day | {trend.significance} |\n"
            out += "\n"
        
        if anomalies:
            out += "### Anomalies Detected\n\n"
            out += "| Date | Campaign | Metric | Expected | Actual | Severity |\n"
            out += "|------|----------|--------|----------|--------|----------|\n"
            for anomaly in anomalies[:10]:
                campaign = self._escape_table_cell(anomaly.campaign)
                metric = self._escape_table_cell(metric_label(anomaly.metric))
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
