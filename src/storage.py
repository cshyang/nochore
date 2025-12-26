"""Partitioned Parquet storage manager for analytics data."""
import logging
from pathlib import Path
from datetime import date, datetime
from typing import List, Union, Optional
import polars as pl

from .data_models import (
    SearchTermRecord,
    ImpressionShareRecord,
    QualityScoreRecord,
    PerformanceRecord
)

logger = logging.getLogger(__name__)

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
            return ["source_account_id", "date", "campaign_id", "ad_group_id", "search_term"]
        elif data_type == "impression_share":
            return ["source_account_id", "date", "campaign_id"]
        elif data_type == "quality_scores":
            return ["source_account_id", "date", "keyword_id"]
        elif data_type == "campaigns":
            return ["platform", "source_account_id", "date", "campaign_id"]
        else:
            raise ValueError(f"Unknown data type: {data_type}")
    
    def append(self, client_id: str, data_type: str, 
               records: Union[List[SearchTermRecord], List[ImpressionShareRecord], 
                            List[QualityScoreRecord], List[PerformanceRecord]]) -> None:
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
                combined = pl.concat([existing_df, month_data], how="diagonal")
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
        
        combined = pl.concat(dfs)
        
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
