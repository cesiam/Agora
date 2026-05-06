# Commit 1 — Initialize monorepo structure
# Message: feat: initialize monorepo structure

mkdir agora && cd agora
mkdir backend frontend
touch .gitignore README.md

cat > .gitignore << 'EOF'
# Python
backend/.venv/
backend/__pycache__/
backend/**/__pycache__/
backend/.env
*.pyc
*.pyo

# Node
frontend/node_modules/
frontend/.env
frontend/dist/

# General
.DS_Store
*.log
EOF

cat > README.md << 'EOF'
# Agora

Multiagent oral exam platform.

## Structure
- `backend/` — FastAPI services (admin agent, course agent, insights agent)
- `frontend/` — React (Vite) student and instructor interfaces

## Services
- STT: Smallest AI Pulse (WebSocket)
- TTS: ElevenLabs eleven_multilingual_v2
- DB: Postgres on Railway (pgvector + tsvector)
- LLM: OpenAI GPT-4o use OpenRouter!! (structured outputs)
EOF

git init
git add .
git commit -m "feat: initialize monorepo structure"
