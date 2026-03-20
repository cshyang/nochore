"""Partitioned Parquet storage manager for analytics data."""
import logging
from pathlib import Path
from datetime import date, datetime
from typing import List, Union, Optional
import polars as pl

from ..models import (
    DimensionBreakdownRecord,
    GoogleConversionActionRecord,
    ImpressionShareRecord,
    PerformanceRecord,
    QualityScoreRecord,
    SearchTermRecord,
)

logger = logging.getLogger(__name__)

INTEGER_DTYPES = {
    pl.Int8,
    pl.Int16,
    pl.Int32,
    pl.Int64,
    pl.UInt8,
    pl.UInt16,
    pl.UInt32,
    pl.UInt64,
}
FLOAT_DTYPES = {pl.Float32, pl.Float64}

class StorageManager:
    """Manages partitioned Parquet storage for analytics data."""
    
    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(exist_ok=True)
    
    def _get_partition_path(self, client_id: str, data_type: str, month: date) -> Path:
        """Get path for monthly partition."""
        client_dir = self.base_dir / client_id / data_type
        client_dir.mkdir(parents=True, exist_ok=True)
        return client_dir / f"{month.strftime('%Y-%m')}.parquet"
    
    def _get_id_columns(self, data_type: str) -> List[str]:
        """Get composite key columns for deduplication."""
        if data_type == "search_terms":
            return ["source_alias", "source_account_id", "date", "campaign_id", "ad_group_id", "search_term"]
        elif data_type == "impression_share":
            return ["source_alias", "source_account_id", "date", "campaign_id"]
        elif data_type == "quality_scores":
            return ["source_alias", "source_account_id", "date", "keyword_id"]
        elif data_type == "campaigns":
            return ["client_id", "platform", "source_alias", "source_account_id", "date", "campaign_id"]
        elif data_type == "conversion_actions":
            return ["source_alias", "source_account_id", "date", "campaign_id", "conversion_action_name"]
        elif data_type == "dimension_breakdown":
            return ["source_alias", "source_account_id", "date", "campaign_id", "dimension_type", "dimension_value"]
        elif data_type == "ga4_landing_pages":
            return ["client_id", "source_alias", "property_id", "date", "landing_page", "channel_group"]
        elif data_type == "search_console_search_analytics":
            return ["client_id", "source_alias", "site_url", "date", "query", "page"]
        else:
            raise ValueError(f"Unknown data type: {data_type}")

    def _resolve_dtype(self, left: pl.DataType, right: pl.DataType) -> pl.DataType:
        """Find a compatible dtype for concatenating persisted partitions."""
        if left == right:
            return left
        if left == pl.Null:
            return right
        if right == pl.Null:
            return left
        if left in INTEGER_DTYPES and right in FLOAT_DTYPES:
            return pl.Float64
        if left in FLOAT_DTYPES and right in INTEGER_DTYPES:
            return pl.Float64
        return left

    def _align_frames_for_concat(self, frames: List[pl.DataFrame]) -> List[pl.DataFrame]:
        """Cast shared columns to compatible dtypes before concatenation."""
        target_schema: dict[str, pl.DataType] = {}
        for frame in frames:
            for column, dtype in frame.schema.items():
                current = target_schema.get(column)
                target_schema[column] = (
                    dtype if current is None else self._resolve_dtype(current, dtype)
                )

        aligned_frames: List[pl.DataFrame] = []
        for frame in frames:
            casts = [
                pl.col(column).cast(target_dtype)
                for column, target_dtype in target_schema.items()
                if column in frame.columns and frame.schema[column] != target_dtype
            ]
            aligned_frames.append(frame.with_columns(casts) if casts else frame)
        return aligned_frames
    
    def append(self, client_id: str, data_type: str,
               records: Union[List[SearchTermRecord], List[ImpressionShareRecord],
                            List[QualityScoreRecord], List[PerformanceRecord],
                            List[DimensionBreakdownRecord], List[GoogleConversionActionRecord]]) -> None:
        """Append records with deduplication."""
        if not records:
            logger.warning(f"No records to append for {client_id}/{data_type}")
            return
        
        # Convert records to dataframe
        if isinstance(records[0], PerformanceRecord):
            data = [
                {
                    'client_id': r.client_id,
                    'platform': r.platform.value,
                    'source_alias': r.source_alias,
                    'source_account_id': r.source_account_id,
                    'date': r.date,
                    'campaign_id': r.campaign_id,
                    'campaign_name': r.campaign_name,
                    'spend': r.spend,
                    'impressions': r.impressions,
                    'clicks': r.clicks,
                    'conversions_primary': r.conversions_primary,
                    'conversions_secondary': r.conversions_secondary,
                    'conversion_value': r.conversion_value,
                    'currency': r.currency
                }
                for r in records
            ]
        elif isinstance(records[0], DimensionBreakdownRecord):
            data = [r.to_dict() for r in records]
        else:
            data = [vars(r) for r in records]
        
        new_df = pl.DataFrame(data).with_columns(pl.col("date").cast(pl.Date))

        # Group by month (include year to avoid mixing years)
        new_df = new_df.with_columns([
            pl.col("date").dt.year().alias("_year"),
            pl.col("date").dt.month().alias("_month"),
        ])

        partitions = new_df.select(["_year", "_month"]).unique().sort(["_year", "_month"])
        for year, month in partitions.iter_rows():
            month_data = new_df.filter(
                (pl.col("_year") == year) & (pl.col("_month") == month)
            ).drop(["_year", "_month"])

            if month_data.is_empty():
                continue

            partition_month = date(int(year), int(month), 1)
            partition_path = self._get_partition_path(client_id, data_type, partition_month)
            
            # Read existing data if exists
            if partition_path.exists():
                existing_df = pl.read_parquet(partition_path)
                combined = pl.concat(
                    self._align_frames_for_concat([existing_df, month_data]),
                    how="diagonal",
                )
            else:
                combined = month_data
            
            # Deduplicate
            id_cols = self._get_id_columns(data_type)
            deduped = combined.unique(subset=id_cols, keep="last")
            
            # Write back
            deduped.write_parquet(partition_path)
            logger.info(f"Wrote {len(deduped)} records to {partition_path}")
    
    def read(self, client_id: str, data_type: str, 
             start_date: Optional[date] = None, 
             end_date: Optional[date] = None) -> pl.DataFrame:
        """Read data for date range."""
        client_dir = self.base_dir / client_id / data_type
        
        if not client_dir.exists():
            logger.warning(f"No data found for {client_id}/{data_type}")
            return pl.DataFrame()
        
        # Find relevant partition files
        partition_files = sorted(client_dir.glob("*.parquet"))
        
        if not partition_files:
            logger.warning(f"No partition files found for {client_id}/{data_type}")
            return pl.DataFrame()
        
        # Read all partitions
        dfs = []
        for partition_file in partition_files:
            df = pl.read_parquet(partition_file)
            dfs.append(df)
        
        if not dfs:
            return pl.DataFrame()

        combined = pl.concat(self._align_frames_for_concat(dfs), how="diagonal")

        # Filter by client_id if column exists (prevents cross-client data pollution)
        if "client_id" in combined.columns:
            combined = combined.filter(pl.col("client_id") == client_id)

        # Filter by date range if specified
        if start_date:
            combined = combined.filter(pl.col("date") >= start_date)
        if end_date:
            combined = combined.filter(pl.col("date") <= end_date)

        return combined
    
    def list_clients(self) -> List[str]:
        """List all clients with stored data."""
        return [d.name for d in self.base_dir.iterdir() if d.is_dir()]
    
    def list_data_types(self, client_id: str) -> List[str]:
        """List data types available for a client."""
        client_dir = self.base_dir / client_id
        if not client_dir.exists():
            return []
        return [d.name for d in client_dir.iterdir() if d.is_dir()]
