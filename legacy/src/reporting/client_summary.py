"""Client-facing markdown summary renderer."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import TextIO

from ..models import ClientSummaryReport, PlatformThemeBreakdown
from .formatting import format_count, format_money, format_pct


class ClientSummaryGenerator:
    """Render the compact client-facing summary report."""

    def __init__(self, output_dir: str = "reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def generate_report(self, report: ClientSummaryReport) -> Path:
        """Write the summary markdown to disk."""
        prefix = _report_prefix(report.client_id, report.brand)
        file_path = self.output_dir / f"{prefix}_{report.period_end[:7]}_summary.md"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with file_path.open("w", encoding="utf-8") as handle:
            title = f"{report.client_id.title()} Campaign Performance"
            if report.brand:
                title = f"{title} - {report.brand}"
            handle.write(f"# {title}\n\n")
            handle.write(f"**Period:** {report.period_start} to {report.period_end}\n")
            if report.brand:
                handle.write(f"**Brand:** {report.brand}\n")
            handle.write(f"**Generated:** {timestamp}\n\n")
            handle.write("---\n\n")

            self._write_spending_overview(handle, report)

            if report.brand_sections:
                for section in report.brand_sections:
                    handle.write(f"## {section.brand}\n\n")
                    for breakdown in section.platform_breakdowns:
                        self._write_platform_breakdown(handle, breakdown, heading_level=3)
                    handle.write("---\n\n")
            else:
                for breakdown in report.platform_breakdowns:
                    self._write_platform_breakdown(handle, breakdown, heading_level=2)

            self._write_insights(handle, report)

            handle.write("## Recommendations\n\n")
            for index, recommendation in enumerate(report.recommendations, start=1):
                handle.write(f"{index}. {recommendation}\n")
            handle.write("\n---\n\n")

            handle.write("## Data Notes\n\n")
            for note in report.data_notes or ["No additional notes."]:
                handle.write(f"- {note}\n")
            handle.write("\n---\n\n")
            handle.write("**Data Sources:** Google Ads API, Meta Ads API\n")

        return file_path

    def _write_spending_overview(self, handle: TextIO, report: ClientSummaryReport) -> None:
        handle.write("## Spending Overview\n\n")
        handle.write("| Platform | Spend | % of Total |\n")
        handle.write("| --- | --- | --- |\n")
        total_currency = report.spending_overview[0].currency if report.spending_overview else "USD"
        total_spend = sum(row.spend for row in report.spending_overview)
        for row in report.spending_overview:
            handle.write(
                f"| {row.platform} | {format_money(row.currency, row.spend)} | {row.spend_pct:.1f}% |\n"
            )
        handle.write(
            f"| **Total** | **{format_money(total_currency, total_spend)}** | **100%** |\n\n---\n\n"
        )

    def _write_platform_breakdown(
        self,
        handle: TextIO,
        breakdown: PlatformThemeBreakdown,
        heading_level: int,
    ) -> None:
        heading = "#" * heading_level
        handle.write(f"{heading} {breakdown.platform} Breakdown by Theme\n\n")
        handle.write("| Theme | Spend | % | Clicks | Leads | CVR | CPL |\n")
        handle.write("| --- | --- | --- | --- | --- | --- | --- |\n")
        for row in breakdown.rows:
            cpl = "N/A" if row.cpl is None else format_money(breakdown.currency, row.cpl)
            handle.write(
                f"| {row.theme} | {format_money(breakdown.currency, row.spend)} | {row.spend_pct:.1f}% | "
                f"{format_count(row.clicks)} | {format_count(row.leads)} | {format_pct(row.cvr)} | {cpl} |\n"
            )

        total_cpl = (
            format_money(breakdown.currency, breakdown.total_spend / breakdown.total_leads)
            if breakdown.total_leads > 0
            else "N/A"
        )
        total_cvr = (
            (breakdown.total_leads / breakdown.total_clicks * 100)
            if breakdown.total_clicks
            else 0.0
        )
        label = breakdown.platform.split()[0]
        handle.write(
            f"| **{label} Total** | **{format_money(breakdown.currency, breakdown.total_spend)}** | **100%** | "
            f"**{format_count(breakdown.total_clicks)}** | **{format_count(breakdown.total_leads)}** | "
            f"**{format_pct(total_cvr)}** | **{total_cpl}** |\n\n"
        )

    def _write_insights(self, handle: TextIO, report: ClientSummaryReport) -> None:
        if not report.insights:
            return

        show_brand = any(row.brand for row in report.insights)
        handle.write("## Key Insights\n\n")
        if show_brand:
            handle.write("| Rank | Brand | Platform | Theme | Spend | Leads | CPL | Assessment |\n")
            handle.write("| --- | --- | --- | --- | --- | --- | --- | --- |\n")
        else:
            handle.write("| Rank | Platform | Theme | Spend | Leads | CPL | Assessment |\n")
            handle.write("| --- | --- | --- | --- | --- | --- | --- |\n")

        for row in report.insights:
            cpl = "N/A" if row.cpl is None else format_money(row.currency, row.cpl)
            if show_brand:
                handle.write(
                    f"| {row.rank} | {row.brand or '-'} | {row.platform} | {row.theme} | "
                    f"{format_money(row.currency, row.spend)} | {format_count(row.leads)} | {cpl} | {row.assessment} |\n"
                )
            else:
                handle.write(
                    f"| {row.rank} | {row.platform} | {row.theme} | {format_money(row.currency, row.spend)} | "
                    f"{format_count(row.leads)} | {cpl} | {row.assessment} |\n"
                )
        handle.write("\n---\n\n")


def _report_prefix(client_id: str, brand: str | None) -> str:
    prefix = client_id
    if brand:
        prefix = f"{prefix}_{_slugify(brand)}"
    return prefix


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
