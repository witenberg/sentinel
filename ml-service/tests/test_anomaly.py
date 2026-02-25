"""Tests for anomaly module: timestamp extraction, severity, analyze_log with synthetic logs (known anomalies at lines 501, 1201, 1501, 1801)."""
import random
from datetime import datetime, timedelta

from anomaly import (
    analyze_log,
    extract_timestamp_robust,
    get_severity_score,
)


def generate_test_logs(filename="test_system.log", num_lines=2000, seed=None):
    """Write synthetic log file with known anomalies at fixed line indices (500, 1200, 1500, 1800)."""
    if seed is not None:
        random.seed(seed)
    levels = ["INFO", "INFO", "INFO", "INFO", "DEBUG", "INFO"]
    components = ["Worker-node-", "Executor-", "Storage-module-", "Network-stack-"]

    start_time = datetime.now()

    with open(filename, "w", encoding="utf-8") as f:
        for i in range(num_lines):
            timestamp = (start_time + timedelta(seconds=i)).strftime("%y/%m/%d %H:%M:%S")
            level = random.choice(levels)
            comp = random.choice(components) + str(random.randint(1, 20))

            rand_val = random.random()
            if rand_val < 0.4:
                msg = f"{timestamp} {level} {comp}: Task {random.randint(1000, 9000)} completed successfully in {random.randint(10, 500)}ms"
            elif rand_val < 0.7:
                msg = f"{timestamp} {level} {comp}: Heartbeat sent to master at 10.0.0.{random.randint(1, 254)}"
            elif rand_val < 0.9:
                msg = f"{timestamp} {level} {comp}: Saved output to hdfs://cluster-name/data/part-{random.randint(10000, 99999)}.parquet"
            else:
                msg = f"{timestamp} {level} {comp}: Received request from user_{random.randint(1, 100)} for resource_{random.randint(100, 200)}"

            if i == 500:
                msg = f"{timestamp} ERROR Worker-node-7: Connection refused to database at 192.168.1.50:5432"
            elif i == 1200:
                msg = f"{timestamp} WARN Storage-module-2: Disk usage on /dev/sda1 is 98%. Performance may degrade."
            elif i == 1500:
                msg = f"{timestamp} FATAL Network-stack-1: Unexpected kernel panic in packet processing thread! NullPointerException at 0x44FF22"
            elif i == 1800:
                msg = f"{timestamp} INFO Executor-12: " + "DEBUG_DUMP " * 20 + "END_OF_DUMP"

            f.write(msg + "\n")

    return filename


class TestExtractTimestampRobust:
    """Timestamp extraction from log lines (feeds time_delta in analyze_log)."""

    def test_standard_format_yy_slash_returns_datetime(self):
        """YY/MM/DD HH:MM:SS (same as log generator)."""
        line = "25/01/15 10:30:00 INFO Worker-1: Task completed"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.hour == 10 and ts.minute == 30 and ts.second == 0

    def test_iso_format_with_full_year_returns_datetime(self):
        """ISO date 2024-01-15 HH:MM:SS."""
        line = "2024-01-15 14:22:33 ERROR Component: Connection refused"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.year == 2024 and ts.month == 1 and ts.day == 15
        assert ts.hour == 14 and ts.minute == 22 and ts.second == 33

    def test_no_timestamp_returns_none(self):
        """Line with no timestamp returns None."""
        assert extract_timestamp_robust("ERROR Connection refused") is None
        assert extract_timestamp_robust("FATAL Kernel panic") is None

    def test_fallback_time_only_returns_datetime(self):
        """Fallback HH:MM:SS returns datetime (e.g. today's date)."""
        line = "14:30:00 Heartbeat received"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.hour == 14 and ts.minute == 30 and ts.second == 0

    def test_format_with_milliseconds_returns_datetime(self):
        """MM-DD HH:MM:SS.mmm."""
        line = "02-02 09:15:00.500 INFO Service started"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.hour == 9 and ts.minute == 15 and ts.second == 0
    
    def test_syslog_format_no_year(self):
        """Syslog MMM DD HH:MM:SS (no year; double space for single-digit day)."""
        line = "Jan  5 14:22:33 systemd[1]: Starting session"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.month == 1 and ts.day == 5
    
    def test_apache_format_with_tz(self):
        """Apache [DD/MMM/YYYY:HH:MM:SS +ZZZZ]."""
        line = "127.0.0.1 - - [15/Jan/2024:14:22:33 +0100] 'GET /index.html' 200"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.day == 15 and ts.month == 1
    
    def test_unix_epoch_format(self):
        """Unix timestamp (seconds)."""
        line = "1705321353 INFO Process heartbeat"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.year == 2024

    def test_european_dot_format(self):
        """DD.MM.YYYY HH:MM:SS."""
        line = "15.01.2024 14:22:33 [DEBUG] User logged in"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.day == 15 and ts.month == 1

    def test_iso_8601_strict(self):
        """ISO with 'T' and 'Z'."""
        line = "2024-01-15T14:22:33Z Critical failure"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.hour == 14 and ts.second == 33
    
    def test_compact_format(self):
        """YYYYMMDDHHMMSS."""
        line = "20240115142233 Service-Update-Finished"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.year == 2024 and ts.second == 33
    
    def test_timestamp_not_at_start(self):
        """Timestamp in the middle of the line."""
        line = "Log produced at 2024-01-15 14:22:33 by Process-A"
        ts = extract_timestamp_robust(line)
        assert ts is not None
        assert ts.year == 2024


class TestGetSeverityScore:
    """Severity scoring (ERROR=3, WARN=1, FATAL=5, EXCEPTION=3.5)."""

    def test_info_returns_zero(self):
        assert get_severity_score("2024/01/15 10:00:00 INFO Component: Ok") == 0.0

    def test_warn_returns_one(self):
        assert get_severity_score("WARN Disk usage high") == 1.0

    def test_error_returns_three(self):
        assert get_severity_score("ERROR Connection refused") == 3.0

    def test_fatal_returns_five(self):
        assert get_severity_score("FATAL Kernel panic") == 5.0

    def test_exception_returns_three_and_half(self):
        assert get_severity_score("NullPointerException at 0x44FF22") == 3.5


class TestAnalyzeLog:
    """analyze_log on list of log lines."""

    def test_empty_list_returns_empty(self):
        assert analyze_log([]) == []

    def test_short_list_returns_empty(self):
        assert analyze_log(["line"] * 5) == []

    def test_returns_list_of_dicts_with_expected_keys(self):
        lines = [
            "25/01/15 10:00:00 INFO Worker-1: Task completed in 100ms",
            "25/01/15 10:00:01 INFO Worker-1: Task completed in 101ms",
        ] * 6
        lines.append("25/01/15 10:00:20 FATAL Worker-1: Kernel panic")
        result = analyze_log(lines)
        assert isinstance(result, list)
        if result:
            for r in result:
                assert "incident_template" in r
                assert "occurrences" in r
                assert "avg_score" in r
                assert "severity" in r
                assert "example_log" in r

    def test_known_anomalies_detected_with_generated_logs(self, tmp_path):
        """Generator has anomalies at lines 501 (ERROR), 1201 (WARN), 1501 (FATAL), 1801; expect >= 2 incidents."""
        log_file = tmp_path / "test_system.log"
        generate_test_logs(filename=str(log_file), num_lines=2000, seed=42)
        lines = log_file.read_text(encoding="utf-8").strip().split("\n")

        results = analyze_log(lines)

        assert len(results) >= 2
        for r in results:
            assert r["occurrences"] >= 1
            assert "incident_template" in r
            assert "example_log" in r

    def test_high_severity_in_results(self, tmp_path):
        """Detected ERROR/FATAL incidents have severity >= 3.0."""
        log_file = tmp_path / "test_system.log"
        generate_test_logs(filename=str(log_file), num_lines=2000, seed=123)
        lines = log_file.read_text(encoding="utf-8").strip().split("\n")
        results = analyze_log(lines)

        high_severity_incidents = [r for r in results if r["severity"] >= 3.0]
        assert len(high_severity_incidents) >= 1
