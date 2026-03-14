"""Trend analyzer for statistical analysis and forecasting."""
import logging
from typing import List
from datetime import date
import polars as pl
import numpy as np

from ..models import TrendResult, Anomaly, Forecast

logger = logging.getLogger(__name__)

class TrendAnalyzer:
    """Analyzes trends, anomalies, and forecasts."""
    
    def __init__(self, performance_df: pl.DataFrame, z_threshold: float = 2.0):
        self.df = performance_df
        self.z_threshold = z_threshold
    
    def calculate_trends(self, metric: str) -> TrendResult:
        """Calculate linear regression trend with significance."""
        if self.df.is_empty():
            return TrendResult(
                metric=metric,
                direction="flat",
                rate_per_day=0.0,
                significance="not_significant"
            )
        
        # Aggregate by date
        daily_df = self.df.group_by("date").agg(pl.col(metric).sum())
        daily_df = daily_df.sort("date")
        
        if len(daily_df) < 7:
            return TrendResult(
                metric=metric,
                direction="flat",
                rate_per_day=0.0,
                significance="not_significant"
            )
        
        # Convert to numpy for linear regression
        dates_numeric = [(d - daily_df["date"][0]).days for d in daily_df["date"]]
        values = daily_df[metric].to_numpy()
        
        # Simple linear regression
        x = np.array(dates_numeric)
        y = values
        
        # Calculate slope
        n = len(x)
        slope = (n * np.sum(x * y) - np.sum(x) * np.sum(y)) / (n * np.sum(x**2) - np.sum(x)**2)
        
        # Calculate R-squared for significance
        y_mean = np.mean(y)
        ss_tot = np.sum((y - y_mean)**2)
        y_pred = slope * x + (np.mean(y) - slope * np.mean(x))
        ss_res = np.sum((y - y_pred)**2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        # Determine direction and significance
        if abs(slope) < 0.01:
            direction = "flat"
        else:
            direction = "up" if slope > 0 else "down"
        
        significance = "significant" if r_squared > 0.7 else "not_significant"
        
        return TrendResult(
            metric=metric,
            direction=direction,
            rate_per_day=slope,
            significance=significance
        )
    
    def detect_anomalies(self, metric: str) -> List[Anomaly]:
        """Detect anomalies using z-score analysis."""
        if self.df.is_empty():
            return []
        
        # Aggregate by date and campaign
        daily_df = self.df.group_by(["date", "campaign_name"]).agg(pl.col(metric).sum())
        
        if len(daily_df) < 7:
            return []
        
        # Calculate z-scores per campaign
        anomalies = []
        for campaign in daily_df["campaign_name"].unique():
            campaign_df = daily_df.filter(pl.col("campaign_name") == campaign).sort("date")
            
            if len(campaign_df) < 7:
                continue
            
            values = campaign_df[metric].to_numpy()
            mean = np.mean(values)
            std = np.std(values)
            
            if std == 0:
                continue
            
            # Calculate z-scores
            z_scores = (values - mean) / std
            
            # Find anomalies
            for i, z_score in enumerate(z_scores):
                if abs(z_score) > self.z_threshold:
                    severity = "high" if abs(z_score) > 3.0 else "medium"
                    
                    anomalies.append(Anomaly(
                        date=campaign_df["date"][i],
                        campaign=campaign,
                        metric=metric,
                        expected=mean,
                        actual=values[i],
                        z_score=z_score,
                        severity=severity
                    ))
        
        logger.info(f"Detected {len(anomalies)} anomalies for {metric}")
        return anomalies
    
    def forecast(self, metric: str, days: int = 7) -> Forecast:
        """Simple exponential smoothing forecast."""
        if self.df.is_empty():
            return Forecast(
                metric=metric,
                days=days,
                projected_value=0.0,
                confidence_interval=(0.0, 0.0)
            )
        
        # Aggregate by date
        daily_df = self.df.group_by("date").agg(pl.col(metric).sum())
        daily_df = daily_df.sort("date")
        
        if len(daily_df) < 7:
            avg_value = daily_df[metric].mean()
            return Forecast(
                metric=metric,
                days=days,
                projected_value=avg_value,
                confidence_interval=(avg_value * 0.8, avg_value * 1.2)
            )
        
        # Use simple moving average for forecast
        values = daily_df[metric].to_numpy()
        recent_avg = np.mean(values[-7:])  # Last 7 days average
        std_recent = np.std(values[-7:])
        
        # Project forward
        projected = recent_avg
        ci_lower = projected - (1.96 * std_recent)  # 95% confidence
        ci_upper = projected + (1.96 * std_recent)
        
        return Forecast(
            metric=metric,
            days=days,
            projected_value=projected,
            confidence_interval=(max(0, ci_lower), ci_upper)
        )
