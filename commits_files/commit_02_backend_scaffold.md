# Commit 2 — Scaffold FastAPI backend with env and dependencies
# Message: feat: scaffold FastAPI backend with env and dependencies

cd backend

python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install \
  fastapi \
  uvicorn[standard] \
  python-dotenv \
  asyncpg \
  pgvector \
  sqlalchemy[asyncio] \
  openai \
  langchain \
  langchain-openai \
  langgraph \
  elevenlabs \
  websockets \
  httpx \
  pydantic \
  python-multipart \
  boto3 \
  celery \
  redis

pip freeze > requirements.txt

mkdir -p app/agents app/api app/db app/services app/models

touch app/__init__.py
touch app/agents/__init__.py
touch app/api/__init__.py
touch app/db/__init__.py
touch app/services/__init__.py
touch app/models/__init__.py

cat > app/main.py << 'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import admin, course, insights

app = FastAPI(title="Agora API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router, prefix="/agents/admin", tags=["admin"])
app.include_router(course.router, prefix="/agents/course", tags=["course"])
app.include_router(insights.router, prefix="/agents/insights", tags=["insights"])

@app.get("/health")
async def health():
    return {"status": "ok"}
EOF

cat > .env.example << 'EOF'
# OpenAI
OPENAI_API_KEY=

# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=19STyYD15bswVz51nqLf

# Smallest AI
SMALLEST_API_KEY=

# Database (Railway)
DATABASE_URL=postgresql+asyncpg://user:password@host:port/dbname

# Object Storage (S3-compatible)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=
AWS_REGION=

# Redis (for Celery job queue)
REDIS_URL=redis://localhost:6379/0
EOF

cp .env.example .env

cat > run.sh << 'EOF'
#!/bin/bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
EOF
chmod +x run.sh

cd ..
git add backend/
git commit -m "feat: scaffold FastAPI backend with env and dependencies"
