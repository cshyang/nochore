"""Google Search Console API fetcher."""

import logging
from datetime import date
from typing import List

from googleapiclient.discovery import build

from ...models.core import SearchConsoleRecord

logger = logging.getLogger(__name__)

ROW_LIMIT = 25000  # SC API max rows per request


class SearchConsoleFetcher:
    """Fetches search analytics data from Google Search Console API."""

    def __init__(self, credentials, source_alias: str, site_url: str):
        self.source_alias = source_alias
        self.site_url = site_url
        self.service = build("searchconsole", "v1", credentials=credentials)

    def fetch_search_analytics(
        self,
        client_id: str,
        start_date: date,
        end_date: date,
    ) -> List[SearchConsoleRecord]:
        """Fetch search analytics with pagination.

        Dimensions: date, query, page
        Metrics: clicks, impressions, ctr, position

        The SC API caps at 25,000 rows per request, so this method
        paginates by incrementing startRow until fewer than ROW_LIMIT
        rows are returned.
        """
        records: List[SearchConsoleRecord] = []
        start_row = 0

        while True:
            request_body = {
                "startDate": start_date.isoformat(),
                "endDate": end_date.isoformat(),
                "dimensions": ["date", "query", "page"],
                "rowLimit": ROW_LIMIT,
                "startRow": start_row,
            }

            try:
                response = (
                    self.service.searchanalytics()
                    .query(siteUrl=self.site_url, body=request_body)
                    .execute()
                )
            except Exception as exc:
                logger.error(f"Search Console API error: {exc}")
                break

            rows = response.get("rows", [])
            if not rows:
                break

            for row in rows:
                keys = row["keys"]
                records.append(
                    SearchConsoleRecord(
                        client_id=client_id,
                        source_alias=self.source_alias,
                        site_url=self.site_url,
                        date=date.fromisoformat(keys[0]),
                        query=keys[1],
                        page=keys[2],
                        clicks=int(row.get("clicks", 0)),
                        impressions=int(row.get("impressions", 0)),
                        ctr=float(row.get("ctr", 0.0)),
                        position=float(row.get("position", 0.0)),
                    )
                )

            if len(rows) < ROW_LIMIT:
                break
            start_row += ROW_LIMIT

        logger.info(
            f"Fetched {len(records)} Search Console records for "
            f"{client_id} ({self.site_url})"
        )
        return records
