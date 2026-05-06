# Commit 5 — Implement hybrid retrieval service: pgvector + BM25 + RRF
# Message: feat: implement hybrid retrieval service — pgvector + BM25 + RRF

cat > backend/app/services/retrieval.py << 'EOF'
import os
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

TOP_K = 20
RRF_K = 60


async def embed_query(query: str) -> list[float]:
    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=query,
    )
    return response.data[0].embedding


def reciprocal_rank_fusion(
    dense_ids: list[str],
    sparse_ids: list[str],
    k: int = RRF_K,
) -> list[str]:
    scores: dict[str, float] = {}
    for rank, chunk_id in enumerate(dense_ids):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (k + rank + 1)
    for rank, chunk_id in enumerate(sparse_ids):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


async def hybrid_retrieve(
    query: str,
    course_id: str,
    db: AsyncSession,
    top_k: int = 8,
) -> list[dict]:
    # 1. Dense retrieval (pgvector cosine similarity)
    embedding = await embed_query(query)
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

    dense_result = await db.execute(
        text("""
            SELECT chunk_id, text, document_id, page, chunk_index,
                   1 - (embedding <=> :embedding::vector) AS score
            FROM chunks
            WHERE course_id = :course_id
            ORDER BY embedding <=> :embedding::vector
            LIMIT :top_k
        """),
        {"embedding": embedding_str, "course_id": course_id, "top_k": TOP_K},
    )
    dense_rows = {row.chunk_id: dict(row._mapping) for row in dense_result}
    dense_ids = list(dense_rows.keys())

    # 2. Sparse retrieval (BM25 via tsvector)
    # Convert query to tsquery-safe format
    ts_query = " & ".join(query.split())

    sparse_result = await db.execute(
        text("""
            SELECT chunk_id, text, document_id, page, chunk_index,
                   ts_rank(ts, to_tsquery('english', :ts_query)) AS score
            FROM chunks
            WHERE course_id = :course_id
              AND ts @@ to_tsquery('english', :ts_query)
            ORDER BY score DESC
            LIMIT :top_k
        """),
        {"ts_query": ts_query, "course_id": course_id, "top_k": TOP_K},
    )
    sparse_rows = {row.chunk_id: dict(row._mapping) for row in sparse_result}
    sparse_ids = list(sparse_rows.keys())

    # 3. RRF merge
    all_rows = {**dense_rows, **sparse_rows}
    merged_ids = reciprocal_rank_fusion(dense_ids, sparse_ids)

    # 4. Return top_k chunks with metadata
    results = []
    for chunk_id in merged_ids[:top_k]:
        row = all_rows[chunk_id]
        results.append({
            "chunk_id": chunk_id,
            "text": row["text"],
            "document_id": str(row["document_id"]),
            "page": row["page"],
            "chunk_index": row["chunk_index"],
        })

    return results
EOF

git add backend/app/services/retrieval.py
git commit -m "feat: implement hybrid retrieval service — pgvector + BM25 + RRF"
