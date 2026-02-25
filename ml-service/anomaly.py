import array
import re
import numpy as np
from collections import Counter
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from dateutil import parser
from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig
from datetime import datetime
from typing import Union

# Input: list of lines or file-like (e.g. open file, NamedTemporaryFile)
LogLinesSource = Union[list[str], object]

def extract_timestamp_robust(line: str):
    """Extract timestamp from a log line; supports Unix epoch, Apache, syslog, ISO, compact."""
    epoch_match = re.search(r'\b(\d{10})\b', line[:20])
    if epoch_match:
        return datetime.fromtimestamp(int(epoch_match.group(1)))

    patterns = [
        r'\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\]',  # Apache
        r'([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})',           # Syslog
        r'(\d{2,4}[./-]\d{2}[./-]\d{2,4}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)',  # ISO/slash/dot
        r'\b(\d{14})\b'  # YYYYMMDDHHMMSS
    ]

    for pattern in patterns:
        match = re.search(pattern, line[:70])
        if match:
            ts_str = match.group(1)
            try:
                if '/' in ts_str and ':' in ts_str:
                    ts_str = re.sub(r'(\d{4}):', r'\1 ', ts_str)  # Apache time part
                dt = parser.parse(ts_str, fuzzy=True)
                return dt
            except:
                continue

    match_time = re.search(r'(\d{2}:\d{2}:\d{2})', line[:50])
    if match_time:
        try:
            return parser.parse(match_time.group(1))  # today + time
        except:
            return None

    return None


def get_severity_score(line: str) -> float:
    """Keyword-based severity: FATAL=5, ERROR/FAIL=3, EXCEPTION=3.5, WARN=1; else 0."""
    line_up = line.upper()
    scores = {"FATAL": 5.0, "ERROR": 3.0, "WARN": 1.0, "EXCEPTION": 3.5, "FAIL": 3.0}
    for word, score in scores.items():
        if word in line_up:
            return score
    return 0.0


def _iter_lines(source: LogLinesSource):
    """Yield stripped lines from list[str] or file-like object (e.g. open file, NamedTemporaryFile)."""
    if hasattr(source, "readline"):
        for line in source:
            if isinstance(line, bytes):
                line = line.decode("utf-8", errors="replace")
            yield line.rstrip("\n")
    else:
        for line in source:
            yield line.strip() if isinstance(line, str) else line


def analyze_log(log_lines: LogLinesSource, window_size: int = 3):
    """Run log anomaly pipeline: Drain3 templates, features, Isolation Forest, aggregate by template.
    log_lines: list of strings or file-like (read line by line). No DataFrame: only numpy arrays
    (numeric features) and one example raw line per template to avoid filling RAM.

    Memory note: For very large logs (e.g. millions of lines), ts_list and template_list still
    grow in RAM (datetime/str per line). For production at that scale, consider pre-allocated
    numpy arrays or streaming aggregation; for typical/CV use this is acceptable.
    """
    miner = TemplateMiner(config=TemplateMinerConfig())
    example_by_template: dict[str, str] = {}

    # 1. Stream lines: use array.array for numeric columns (lighter than list); ts/template stay list
    ts_list: list = []
    severity_list = array.array("d")
    len_list = array.array("d")
    cluster_id_list: list = []
    template_list: list = []

    for line in _iter_lines(log_lines):
        line_stripped = line.strip() if isinstance(line, str) else line
        ts = extract_timestamp_robust(line_stripped)
        result = miner.add_log_message(line_stripped)
        template = result["template_mined"]
        cluster_id = result["cluster_id"]
        if template not in example_by_template:
            example_by_template[template] = line_stripped
        ts_list.append(ts)
        severity_list.append(get_severity_score(line_stripped))
        len_list.append(len(line_stripped))
        cluster_id_list.append(cluster_id)
        template_list.append(template)

    n = len(severity_list)
    if n < 10:
        return []

    # 2. Numeric arrays only (no DataFrame)
    severity_arr = np.array(severity_list, dtype=np.float64)
    len_arr = np.array(len_list, dtype=np.float64)
    ts_float = np.array(
        [t.timestamp() if t is not None else np.nan for t in ts_list],
        dtype=np.float64,
    )

    # Template frequency from cluster counts
    cluster_counts = Counter(cluster_id_list)
    template_freq = np.array([cluster_counts[c] / n for c in cluster_id_list], dtype=np.float64)

    # Time delta: fill missing timestamps (ffill then bfill), vectorized (no Python loops)
    if np.isnan(ts_float).all():
        time_delta_log = np.zeros(n, dtype=np.float64)
    else:
        ts_filled = ts_float.copy()
        mask = np.isnan(ts_filled)
        # Forward fill
        idx = np.where(~mask, np.arange(n), 0)
        np.maximum.accumulate(idx, out=idx)
        ts_filled = ts_filled[idx]
        # Backward fill for leading NaNs
        mask = np.isnan(ts_filled)
        if mask.any():
            rev = ts_filled[::-1]
            idx_rev = np.where(~np.isnan(rev), np.arange(n), 0)
            np.maximum.accumulate(idx_rev, out=idx_rev)
            ts_filled = rev[idx_rev][::-1].copy()
        time_delta = np.abs(np.diff(ts_filled, prepend=ts_filled[0]))
        time_delta_log = np.log1p(time_delta)

    # 3. Window mean of template_freq; build feature matrix (n, 5) without pandas
    kernel = np.ones(window_size + 1)
    window_sum = np.convolve(template_freq, kernel, mode='full')[:n]
    counts = np.minimum(np.arange(1, n + 1), window_size + 1)
    window_freq = window_sum / counts

    X_final = np.column_stack((
        severity_arr,
        time_delta_log,
        len_arr / 500.0,
        template_freq,
        window_freq,
    ))
    X_final_scaled = StandardScaler().fit_transform(X_final)

    # 4. Isolation Forest
    model = IsolationForest(contamination="auto", random_state=42)
    model.fit(X_final_scaled)
    scores = model.decision_function(X_final_scaled)
    anomaly_threshold = np.mean(scores) - 2 * np.std(scores)

    # 5. Flag anomalies; use arrays and template_list (no df)
    results = []
    for i in range(n):
        score = scores[i]
        is_model_anomaly = score < anomaly_threshold
        is_high_severity = severity_arr[i] >= 3.0

        if is_model_anomaly or is_high_severity:
            template = template_list[i].strip() if isinstance(template_list[i], str) else str(template_list[i]).strip()
            results.append({
                "line_no": int(i) + 1,
                "score": round(float(scores[i]), 4),
                "is_anomaly": bool(is_model_anomaly),
                "severity": float(severity_arr[i]),
                "template": template,
                "content": example_by_template.get(template, ""),
            })

    sorted_results = sorted(results, key=lambda x: x['score'])

    # 6. Aggregate by Drain3 template: one incident per template (occurrences, avg_score, example_log)
    aggregated_alerts = {}
    for res in sorted_results:
        tmpl = res['template']
        if tmpl not in aggregated_alerts:
            aggregated_alerts[tmpl] = {
                "count": 0,
                "severity": res['severity'],
                "is_ml_anomaly": res['is_anomaly'],
                "example_content": res['content'],
                "avg_score": 0.0,
                "scores": []
            }
        
        aggregated_alerts[tmpl]["count"] += 1
        aggregated_alerts[tmpl]["scores"].append(res['score'])

    final_incidents = []
    for tmpl, data in aggregated_alerts.items():
        data["avg_score"] = sum(data["scores"]) / len(data["scores"])
        del data["scores"]

        final_incidents.append({
            "incident_template": tmpl,
            "occurrences": data["count"],
            "avg_score": round(data["avg_score"], 4),
            "severity": data["severity"],
            "example_log": data["example_content"]
        })
    
    return sorted(final_incidents, key=lambda x: (x['severity'], x['occurrences']), reverse=True)
