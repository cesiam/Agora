# Agora

Multi-agentic AI product that enables structured oral evaluations to improve understanding

## Structure
- `backend/` — FastAPI services (admin agent, course agent, insights agent)
- `frontend/` — React (Vite) student and instructor interfaces

## Services
- STT: Smallest AI Pulse (WebSocket)
- TTS: ElevenLabs eleven_multilingual_v2
- DB: Postgres on Railway (pgvector + tsvector)
- LLM: OpenAI GPT-4o use OpenRouter!! (structured outputs)
