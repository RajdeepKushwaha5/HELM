import os
import sys
import json
import base64
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load env variables
load_dotenv()

pk = os.getenv("LANGFUSE_PUBLIC_KEY")
sk = os.getenv("LANGFUSE_SECRET_KEY")
host = os.getenv("LANGFUSE_HOST", "https://us.cloud.langfuse.com")

if not pk or not sk:
    print("\n[!] Error: Langfuse credentials not found in backend/.env!")
    print("Please configure LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY first.")
    sys.exit(1)

print("=== Helm Langfuse Live Trace Generator ===")
print(f"Connecting to host: {host}")
print(f"Public Key: {pk[:10]}...")

# Clean base URL
host = host.rstrip("/")

# Basic Auth header creation
auth_str = f"{pk}:{sk}".encode("utf-8")
auth_b64 = base64.b64encode(auth_str).decode("utf-8")

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Basic {auth_b64}"
}

# Generate timestamps
now = datetime.now(timezone.utc)
trace_time = now.isoformat(timespec='milliseconds').replace("+00:00", "Z")
obs_time = (now + timedelta(seconds=2)).isoformat(timespec='milliseconds').replace("+00:00", "Z")

# Unique IDs
trace_id = f"tr-{int(now.timestamp())}"
gen_id = f"gen-{int(now.timestamp())}"
loop_trace_id = f"tr-loop-{int(now.timestamp())}"

# ── INGESTION BATCH PAYLOAD ───────────────────────────────────────────────────
batch = [
    # 1. Standard AI Spend Trace
    {
        "id": f"event-t1-{trace_id}",
        "type": "trace-create",
        "timestamp": trace_time,
        "body": {
            "id": trace_id,
            "name": "outreach-generation",
            "userId": "hackathon-judge-demo",
            "metadata": {
                "linearId": "RJD-14",  # Connects to our live RJD-14 Linear ticket
                "team": "growth-team",
                "featureTag": "lighthouse"
            }
        }
    },
    # 2. Standard Generation Observation (Gemini-1.5-flash)
    {
        "id": f"event-o1-{gen_id}",
        "type": "observation-create",
        "timestamp": obs_time,
        "body": {
            "id": gen_id,
            "traceId": trace_id,
            "type": "GENERATION",
            "name": "prospect-outreach-gemini",
            "model": "gemini-1.5-flash",
            "input": [{"role": "user", "content": "Write compelling SaaS outreach."}],
            "output": "Hi Notion Team, we noticed your team is actively hiring...",
            "usage": {
                "input": 320,
                "output": 180,
                "total": 500
            },
            # Explicit cost mapping so Token ROI shows cost instantly
            "calculatedCost": 0.00062, 
            "latency": 1.250
        }
    },
    
    # 3. Model Mismatch Trace (using gpt-4o for a tiny prompt to trigger mismatch optimizer)
    {
        "id": f"event-t2-{trace_id}",
        "type": "trace-create",
        "timestamp": trace_time,
        "body": {
            "id": f"tr-mismatch-{trace_id}",
            "name": "simple-json-parse",
            "userId": "hackathon-judge-demo",
            "metadata": {
                "linearId": "RJD-18",
                "team": "platform-team",
                "featureTag": "json-parser"
            }
        }
    },
    {
        "id": f"event-o2-{gen_id}",
        "type": "observation-create",
        "timestamp": obs_time,
        "body": {
            "id": f"gen-mismatch-{gen_id}",
            "traceId": f"tr-mismatch-{trace_id}",
            "type": "GENERATION",
            "name": "simple-json-parse",
            "model": "gpt-4o",  # triggers expensive model mismatch
            "input": "Parse: {'status': 'ok'}",
            "output": "{'status': 'ok'}",
            "usage": {
                "input": 20,
                "output": 10,
                "total": 30
            },
            "calculatedCost": 0.015,
            "latency": 0.340
        }
    },

    # 4. Runway Agent Loop Trace (Triggers Loop Waste Detector in Token ROI)
    {
        "id": f"event-t3-{loop_trace_id}",
        "type": "trace-create",
        "timestamp": trace_time,
        "body": {
            "id": loop_trace_id,
            "name": "agent-sentry-autopilot",
            "userId": "hackathon-judge-demo",
            "metadata": {
                "linearId": "RJD-15",
                "team": "ops-team",
                "featureTag": "autopilot"
            }
        }
    }
]

# Add 12 generation loops to trigger loop detector (>10 needed)
for i in range(12):
    loop_obs_time = (now + timedelta(seconds=i+5)).isoformat(timespec='milliseconds').replace("+00:00", "Z")
    batch.append({
        "id": f"event-loop-o-{i}-{loop_trace_id}",
        "type": "observation-create",
        "timestamp": loop_obs_time,
        "body": {
            "id": f"obs-loop-{i}-{loop_trace_id}",
            "traceId": loop_trace_id,
            "type": "GENERATION",
            "name": "agent-planning-step",
            "model": "claude-opus-3-5",
            "input": "Analysing logs...",
            "output": f"Log analysis step {i} completed. Re-running loop.",
            "usage": {
                "input": 150,
                "output": 50,
                "total": 200
            },
            "calculatedCost": 0.003,
            "latency": 0.850
        }
    })

# Ingest trace and observation updates
payload = {"batch": batch}

print("\nIngesting traces via Langfuse Ingestion API...")

url = f"{host}/api/public/ingestion"
req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("\n=== Success! ===")
        print(f"Traces ingested successfully: {res.get('successes', [])}")
        print("1. Traces are now live on your Langfuse Cloud Console!")
        print("2. Run uvicorn server and click 'Refresh' on Helm's Token ROI panel!")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", errors="replace")
    print(f"\n[X] HTTP Error {e.code}: {e.reason}")
    print(f"Details: {body}")
except Exception as e:
    print(f"\n[X] Ingestion failed: {e}")
