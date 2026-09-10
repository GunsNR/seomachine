"""API usage metering. Every external call is counted per step and logged."""

import logging
from collections import defaultdict
from typing import Dict

logger = logging.getLogger(__name__)


class UsageMeter:
    """Tracks calls and billable units per pipeline step."""

    def __init__(self) -> None:
        self.calls: Dict[str, int] = defaultdict(int)
        self.units: Dict[str, int] = defaultdict(int)

    def record(self, step: str, calls: int = 1, units: int = 0) -> None:
        self.calls[step] += calls
        self.units[step] += units

    def total_units(self) -> int:
        return sum(self.units.values())

    def report_lines(self) -> list:
        lines = ["API usage by step:"]
        for step in sorted(set(self.calls) | set(self.units)):
            lines.append(
                f"  {step}: {self.calls[step]} calls, {self.units[step]} units"
            )
        lines.append(f"  TOTAL: {sum(self.calls.values())} calls, {self.total_units()} units")
        lines.append("  (Semrush unit counts are estimates from SEMRUSH_UNITS_PER_LINE.)")
        return lines

    def log_report(self) -> None:
        for line in self.report_lines():
            logger.info(line)
