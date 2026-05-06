#!/bin/bash
cd "$(dirname "$0")"
python3.12 -m uvicorn app.main:app --reload --port 8000
