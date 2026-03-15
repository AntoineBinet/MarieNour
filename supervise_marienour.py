#!/usr/bin/env python3
"""
Superviseur pour MarieNour (MNWork).
Lance node server.js, redémarre sur exit 42, et rollback Git en cas de crash loop.
"""
import os
import subprocess
import time

import urllib.request

# Configuration (variables d'environnement ou défauts)
ROOT = os.environ.get("MNWORK_DIR", os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "3000"))
HEALTH_URL = f"http://127.0.0.1:{PORT}/api/health"
HEALTH_TIMEOUT = 8
HEALTH_RETRIES = 5
HEALTH_INTERVAL = 2
CRASH_LOOP_COUNT = 3
CRASH_LOOP_WINDOW = 120  # secondes
EXIT_RESTART = 42
LAST_COMMIT_FILE = os.path.join(ROOT, ".last_commit_hash")


def health_check():
    for _ in range(HEALTH_RETRIES):
        try:
            req = urllib.request.Request(HEALTH_URL)
            with urllib.request.urlopen(req, timeout=HEALTH_TIMEOUT) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(HEALTH_INTERVAL)
    return False


def run_rollback():
    if not os.path.isfile(LAST_COMMIT_FILE):
        return False
    try:
        with open(LAST_COMMIT_FILE, "r") as f:
            ref = f.read().strip()
        if not ref:
            return False
        subprocess.run(
            ["git", "reset", "--hard", ref],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        return True
    except Exception:
        return False


def main():
    crash_times = []
    while True:
        proc = subprocess.Popen(
            ["node", "server.js"],
            cwd=ROOT,
            env={**os.environ, "PORT": str(PORT)},
        )
        time.sleep(3)
        if not health_check():
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            crash_times.append(time.time())
            crash_times = [t for t in crash_times if time.time() - t <= CRASH_LOOP_WINDOW]
            if len(crash_times) >= CRASH_LOOP_COUNT and run_rollback():
                crash_times.clear()
            time.sleep(2)
            continue
        code = proc.wait()
        if code == EXIT_RESTART:
            crash_times.clear()
            time.sleep(1)
            continue
        now = time.time()
        crash_times.append(now)
        crash_times = [t for t in crash_times if now - t <= CRASH_LOOP_WINDOW]
        if len(crash_times) >= CRASH_LOOP_COUNT and run_rollback():
            crash_times.clear()
            time.sleep(2)
        else:
            time.sleep(2)


if __name__ == "__main__":
    main()
