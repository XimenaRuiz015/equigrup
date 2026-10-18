from pathlib import Path
import chromadb
from chromadb.utils import embedding_functions

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CHROMA_DIR = BASE_DIR / "data" / "chroma_db"

_coleccion = None

def obtener_coleccion():
    """Conecta a la base vectorial de ChromaDB existente usando una instancia en caché."""
    global _coleccion
    if _coleccion is None:
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        emb_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="paraphrase-multilingual-MiniLM-L12-v2"
        )
        _coleccion = client.get_or_create_collection(
            name="equigrup_documentacion",
            embedding_function=emb_fn,
            metadata={"hnsw:space": "cosine"}
        )
    return _coleccion

def buscar_contexto(consulta: str, n_resultados: int = 4) -> list[dict]:
    """
    Busca los fragmentos más relevantes para una consulta dada.
    """
    if not CHROMA_DIR.exists():
        print("⚠️ Advertencia: No existe la base de ChromaDB. Ejecuta indexar_documentos.py primero.")
        return []

    coleccion = obtener_coleccion()
    
    resultados = coleccion.query(
        query_texts=[consulta],
        n_results=n_resultados
    )

    fragmentos_recuperados = []
    
    if resultados and "documents" in resultados and resultados["documents"]:
        docs = resultados["documents"][0]
        metas = resultados["metadatas"][0] if "metadatas" in resultados else [{}] * len(docs)
        distancias = resultados.get("distances", [[0] * len(docs)])[0]

        for texto, metadata, dist in zip(docs, metas, distancias):
            fragmentos_recuperados.append({
                "texto": texto,
                "documento": metadata.get("documento", "Desconocido"),
                "pagina": metadata.get("pagina", 1),
                "distancia": dist
            })

    return fragmentos_recuperados