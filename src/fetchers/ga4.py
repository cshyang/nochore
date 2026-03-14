"""Google Analytics 4 Data API fetcher."""

import logging
from datetime import date
from typing import List

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    MetricType,
    RunReportRequest,
    RunReportResponse,
)

from ..models.core import GA4LandingPageRecord

logger = logging.getLogger(__name__)


def _parse_metric_value(raw_value: str, metric_type: int) -> int | float:
    """Parse a GA4 metric string using the API-declared metric type."""
    if metric_type == MetricType.TYPE_INTEGER:
        return int(raw_value)
    return float(raw_value)


class GA4Fetcher:
    """Fetches landing page engagement data from the GA4 Data API."""

    def __init__(self, credentials, source_alias: str, property_id: str):
        self.source_alias = source_alias
        self.property_id = property_id
        self.client = BetaAnalyticsDataClient(credentials=credentials)

    def fetch_landing_pages(
        self,
        client_id: str,
        start_date: date,
        end_date: date,
    ) -> List[GA4LandingPageRecord]:
        """Fetch landing page data with engagement metrics.

        Dimensions: date, landingPage, defaultChannelGrouping
        Metrics: sessions, engagedSessions, keyEvents, engagementRate, bounceRate
        """
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[
                DateRange(
                    start_date=start_date.isoformat(),
                    end_date=end_date.isoformat(),
                )
            ],
            dimensions=[
                Dimension(name="date"),
                Dimension(name="landingPage"),
                Dimension(name="defaultChannelGrouping"),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="engagedSessions"),
                Metric(name="keyEvents"),
                Metric(name="engagementRate"),
                Metric(name="bounceRate"),
            ],
            limit=100_000,
        )

        records: List[GA4LandingPageRecord] = []
        try:
            response: RunReportResponse = self.client.run_report(request)
            metric_types = [header.type_ for header in response.metric_headers]

            # Log sampling warning if present
            if response.metadata and response.metadata.data_loss_from_other_row:
                logger.warning(
                    "GA4 response has data loss from 'other' row aggregation "
                    f"for property {self.property_id}"
                )

            for row in response.rows:
                # GA4 returns dates as YYYYMMDD
                raw_date = row.dimension_values[0].value
                record_date = date(
                    int(raw_date[:4]), int(raw_date[4:6]), int(raw_date[6:])
                )
                sessions = _parse_metric_value(
                    row.metric_values[0].value, metric_types[0]
                )
                engaged_sessions = _parse_metric_value(
                    row.metric_values[1].value, metric_types[1]
                )
                key_events = _parse_metric_value(
                    row.metric_values[2].value, metric_types[2]
                )
                engagement_rate = _parse_metric_value(
                    row.metric_values[3].value, metric_types[3]
                )
                bounce_rate = _parse_metric_value(
                    row.metric_values[4].value, metric_types[4]
                )
                records.append(
                    GA4LandingPageRecord(
                        client_id=client_id,
                        source_alias=self.source_alias,
                        property_id=self.property_id,
                        date=record_date,
                        landing_page=row.dimension_values[1].value,
                        channel_group=row.dimension_values[2].value,
                        sessions=int(sessions),
                        engaged_sessions=int(engaged_sessions),
                        key_events=float(key_events),
                        engagement_rate=float(engagement_rate),
                        bounce_rate=float(bounce_rate),
                    )
                )
            logger.info(
                f"Fetched {len(records)} GA4 landing page records for "
                f"{client_id} (property {self.property_id})"
            )
        except Exception as exc:
            logger.error(f"GA4 API error fetching landing pages: {exc}")

        return records
