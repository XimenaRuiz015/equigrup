import os
import shutil
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from datetime import datetime
from app.agent.agent import procesar_mensaje_equi
from app.auth.email_service import enviar_codigo_verificacion_email
from app.database.db import get_db, init_db, SessionLocal
from app.database import crud

import urllib.parse

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DOCUMENTS_DIR = BASE_DIR / "documents"
UPLOADS_DIR = BASE_DIR / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# Inicializar Base de Datos y Usuario de Seguridad
init_db()
try:
    _db_init = SessionLocal()
    crud.crear_usuario_inicial_si_no_existe(_db_init)
    _db_init.close()
except Exception as _e:
    print(f"Nota init: {_e}")

app = FastAPI(
    title="Asistente Equi - Equigrup API",
    description="API para el Asistente Inteligente de Gestión Técnica, Proyectos y Documentación de Equigrup",
    version="1.2.0"
)

# Servir estáticos de uploads y documentos
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/documents", StaticFiles(directory=str(DOCUMENTS_DIR)), name="documents")

def buscar_archivo_documento(nombre_o_ruta: str) -> Optional[Path]:
    """
    Localiza un archivo técnico en 'documents/' o 'data/uploads/' mediante búsqueda inteligente.
    """
    if not nombre_o_ruta:
        return None
    nombre_limpio = urllib.parse.unquote(nombre_o_ruta).strip()

    # 1. Ruta directa
    directa_doc = DOCUMENTS_DIR / nombre_limpio
    if directa_doc.is_file():
        return directa_doc
    directa_up = UPLOADS_DIR / nombre_limpio
    if directa_up.is_file():
        return directa_up

    # 2. Búsqueda por nombre de archivo exacto o insensible a mayúsculas
    nombre_base = Path(nombre_limpio).name.lower()
    for a in DOCUMENTS_DIR.rglob("*.*"):
        if a.is_file() and a.name.lower() == nombre_base:
            return a
    for a in UPLOADS_DIR.rglob("*.*"):
        if a.is_file() and a.name.lower() == nombre_base:
            return a

    # 3. Búsqueda por nombre sin extensión (ej. busca .pdf si pedían .docx o viceversa)
    nombre_stem = Path(nombre_limpio).stem.lower()
    for a in DOCUMENTS_DIR.rglob("*.*"):
        if a.is_file() and a.stem.lower() == nombre_stem:
            return a
    for a in UPLOADS_DIR.rglob("*.*"):
        if a.is_file() and a.stem.lower() == nombre_stem:
            return a

    return None

from app.agent.agent import procesar_mensaje_equi, encontrar_documento_asociado

@app.get("/api/documentos/{nombre_archivo:path}")
def obtener_o_ver_documento(nombre_archivo: str):
    """
    Sirve cualquier documento de referencia (PDF, Word, imagen) directamente para visualización en el navegador o descarga.
    Si no existe archivo físico, retorna una página informativa amigable.
    """
    archivo = buscar_archivo_documento(nombre_archivo)
    if not archivo or not archivo.exists():
        html_not_found = f"""
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Documento no adjunto | Equigrup</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body {{
                    background-color: #0b1120;
                    color: #f1f5f9;
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                    box-sizing: border-box;
                }}
                .card {{
                    background: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 16px;
                    padding: 36px 32px;
                    max-width: 520px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }}
                .icon {{ font-size: 48px; margin-bottom: 16px; }}
                h1 {{ font-size: 20px; margin: 0 0 12px 0; color: #f8fafc; font-weight: 700; }}
                p {{ font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }}
                .tag {{ background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 4px 10px; border-radius: 6px; font-weight: 600; word-break: break-all; display: inline-block; margin: 4px 0; }}
                .actions {{ display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }}
                a, button {{
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 13.5px;
                    font-weight: 600;
                    text-decoration: none;
                    cursor: pointer;
                    transition: all 0.2s;
                }}
                .btn-primary {{
                    background: #2563eb;
                    color: white;
                    border: 1px solid #3b82f6;
                }}
                .btn-primary:hover {{ background: #1d4ed8; }}
                .btn-secondary {{
                    background: #0f172a;
                    color: #cbd5e1;
                    border: 1px solid #334155;
                }}
                .btn-secondary:hover {{ background: #334155; }}
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">📂</div>
                <h1>Documento Físico no Adjunto</h1>
                <p>El registro <span class="tag">{nombre_archivo}</span> está guardado en la Base de Datos de Equigrup, pero aún no se le ha adjuntado un archivo PDF o Word digital en el servidor.</p>
                <div class="actions">
                    <a href="/" class="btn-primary">← Volver al Panel</a>
                    <button onclick="window.close()" class="btn-secondary">Cerrar pestaña</button>
                </div>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html_not_found, status_code=404)

    ext = archivo.suffix.lower()
    if ext == ".pdf":
        media_type = "application/pdf"
    elif ext in [".docx", ".doc"]:
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif ext in [".jpeg", ".jpg"]:
        media_type = "image/jpeg"
    elif ext == ".png":
        media_type = "image/png"
    elif ext in [".xlsx", ".xls"]:
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        media_type = "application/octet-stream"

    # 'inline' para abrir directamente en el visor de PDF del navegador
    headers = {
        "Content-Disposition": f'inline; filename="{archivo.name}"'
    }
    return FileResponse(path=str(archivo), media_type=media_type, headers=headers)

# --- MODELOS PYDANTIC ---
class LoginRequest(BaseModel):
    username: str
    password: str

class SolicitarCodigoRequest(BaseModel):
    email_o_username: str

class CambiarPasswordRequest(BaseModel):
    email: str
    codigo: str
    nueva_password: str

class ChatRequest(BaseModel):
    mensaje: str

class ChatResponse(BaseModel):
    asistente: str
    respuesta: str
    fuentes_consultadas: list[str]

class ProyectoCreate(BaseModel):
    titulo: str
    cliente: Optional[str] = None
    ubicacion: Optional[str] = None
    categoria: Optional[str] = "Instalación"
    estado: Optional[str] = "En ejecución"
    maquinaria: Optional[str] = None
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    creado_por: Optional[str] = "Freddy"

# --- ENDPOINTS DE AUTENTICACIÓN Y SEGURIDAD ---
@app.post("/api/auth/login")
def login_endpoint(req: LoginRequest, db: Session = Depends(get_db)):
    usuario = crud.verificar_login(db, req.username, req.password)
    if not usuario:
        raise HTTPException(
            status_code=401,
            detail="Credenciales incorrectas. Verifica tu usuario y contraseña."
        )
    token = f"equi_auth_session_{usuario.id}_{int(datetime.utcnow().timestamp())}"
    return {
        "autenticado": True,
        "token": token,
        "usuario": usuario.to_dict(),
        "mensaje": f"Bienvenido, {usuario.nombre_completo}"
    }

@app.post("/api/auth/solicitar-codigo")
def solicitar_codigo_endpoint(req: SolicitarCodigoRequest, db: Session = Depends(get_db)):
    resultado = crud.generar_codigo_recuperacion(db, req.email_o_username)
    if not resultado:
        raise HTTPException(status_code=400, detail="Debes proporcionar un usuario o correo válido.")
    
    email_destino, codigo = resultado
    res_envio = enviar_codigo_verificacion_email(email_destino, codigo)
    
    return {
        "exito": True,
        "email": email_destino,
        "mensaje": res_envio.get("mensaje"),
        "modo": res_envio.get("modo"),
        "codigo_dev": res_envio.get("codigo_dev")
    }

@app.post("/api/auth/verificar-y-cambiar-password")
def cambiar_password_endpoint(req: CambiarPasswordRequest, db: Session = Depends(get_db)):
    if len(req.nueva_password.strip()) < 4:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres.")
    
    exito = crud.cambiar_password_con_codigo(db, req.email, req.codigo, req.nueva_password)
    if not exito:
        raise HTTPException(
            status_code=400,
            detail="El código de verificación es inválido o ha expirado (15 minutos de validez)."
        )
    
    return {
        "exito": True,
        "mensaje": "¡Contraseña actualizada exitosamente! Ya puedes iniciar sesión con tu nueva clave."
    }

@app.get("/api/auth/verificar-sesion")
def verificar_sesion_endpoint():
    return {"estado": "activo", "sistema": "Equigrup Security Portal v1.0"}

# --- ENDPOINTS CHAT EQUI ---
@app.post("/chat", response_model=ChatResponse)
@app.post("/api/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    if not request.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío.")
    
    resultado = procesar_mensaje_equi(request.mensaje)
    return resultado


# --- ENDPOINTS DE PROYECTOS (BASE DE DATOS) ---
@app.post("/api/proyectos")
def crear_proyecto_endpoint(datos: ProyectoCreate, db: Session = Depends(get_db)):
    nuevo = crud.crear_proyecto(db, datos.model_dump())
    return {
        "mensaje": "Proyecto registrado exitosamente",
        "proyecto": nuevo.to_dict()
    }

@app.get("/api/proyectos")
def listar_proyectos(db: Session = Depends(get_db)):
    proyectos = crud.obtener_proyectos(db)
    resultados = []
    for p in proyectos:
        d = p.to_dict()
        doc_nombre = encontrar_documento_asociado(p.titulo)
        if not doc_nombre and p.multimedia:
            for m in p.multimedia:
                if m.archivo_url:
                    doc_nombre = Path(m.archivo_url).name
                    break
        d["documento_nombre"] = doc_nombre
        d["documento_url"] = f"/api/documentos/{urllib.parse.quote(doc_nombre)}" if doc_nombre else None
        d["tiene_documento"] = bool(doc_nombre)
        resultados.append(d)
    return resultados

@app.get("/api/proyectos/{proyecto_id}")
def ver_proyecto(proyecto_id: int, db: Session = Depends(get_db)):
    p = crud.obtener_proyecto_por_id(db, proyecto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    d = p.to_dict()
    doc_nombre = encontrar_documento_asociado(p.titulo)
    d["documento_nombre"] = doc_nombre
    d["documento_url"] = f"/api/documentos/{urllib.parse.quote(doc_nombre)}" if doc_nombre else None
    d["tiene_documento"] = bool(doc_nombre)
    return d

@app.put("/api/proyectos/{proyecto_id}")
def actualizar_proyecto_endpoint(proyecto_id: int, datos: dict, db: Session = Depends(get_db)):
    p_act = crud.actualizar_proyecto(db, proyecto_id, datos)
    if not p_act:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return {"mensaje": "Proyecto actualizado exitosamente", "proyecto": p_act.to_dict()}

@app.delete("/api/proyectos/{proyecto_id}")
def eliminar_proyecto_endpoint(proyecto_id: int, db: Session = Depends(get_db)):
    exito = crud.eliminar_proyecto(db, proyecto_id)
    if not exito:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return {"mensaje": "Proyecto eliminado exitosamente"}

# --- ENDPOINTS MULTIMEDIA / SUBIDA DE ARCHIVOS ---
@app.post("/api/upload")
async def subir_archivo(
    archivo: UploadFile = File(...),
    proyecto_id: Optional[int] = Form(None),
    titulo: Optional[str] = Form(None),
    seccion: Optional[str] = Form("galeria"),
    db: Session = Depends(get_db)
):
    try:
        # Generar nombre seguro
        nombre_limpio = archivo.filename.replace(" ", "_")
        ruta_destino = UPLOADS_DIR / nombre_limpio
        
        # Guardar archivo en disco
        with open(ruta_destino, "wb") as buffer:
            shutil.copyfileobj(archivo.file, buffer)
            
        url_archivo = f"/uploads/{nombre_limpio}"
        
        # Registrar en la base de datos si se requiere
        registro_media = crud.agregar_multimedia(db, {
            "proyecto_id": proyecto_id,
            "titulo": titulo or archivo.filename,
            "tipo": "imagen" if archivo.content_type.startswith("image") else "documento",
            "archivo_url": url_archivo,
            "seccion": seccion
        })
        
        # Si se asoció a un proyecto y es imagen principal, actualizar el proyecto
        if proyecto_id and not titulo:
            p = crud.obtener_proyecto_por_id(db, proyecto_id)
            if p and not p.imagen_url:
                p.imagen_url = url_archivo
                db.commit()

        return {
            "mensaje": "Archivo subido exitosamente",
            "url": url_archivo,
            "multimedia": registro_media.to_dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir archivo: {str(e)}")

# --- ENDPOINTS BLOG Y BANNER WEB ---
@app.get("/api/blog")
def listar_publicaciones_blog(solo_banner: bool = False, db: Session = Depends(get_db)):
    pubs = crud.obtener_publicaciones(db, solo_banner=solo_banner)
    return [p.to_dict() for p in pubs]

@app.get("/api/blog/{pub_id}")
def ver_publicacion_blog(pub_id: int, db: Session = Depends(get_db)):
    pub = crud.obtener_publicacion_por_id(db, pub_id)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return pub.to_dict()

@app.post("/api/blog/publicar")
async def publicar_en_blog_endpoint(
    titulo: str = Form(...),
    resumen: Optional[str] = Form(None),
    contenido: str = Form(...),
    proyecto_id: Optional[int] = Form(None),
    es_banner: bool = Form(True),
    categoria: Optional[str] = Form("Noticias y Obras"),
    autor: Optional[str] = Form("Equigrup"),
    archivo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    try:
        url_multimedia = None
        tipo_media = "imagen"

        if archivo and archivo.filename:
            ext = Path(archivo.filename).suffix.lower()
            if ext in [".mp4", ".webm", ".mov", ".avi", ".mkv"]:
                tipo_media = "video"
            else:
                tipo_media = "imagen"

            nombre_limpio = f"blog_{int(datetime.utcnow().timestamp())}_{archivo.filename.replace(' ', '_')}"
            ruta_destino = UPLOADS_DIR / nombre_limpio
            with open(ruta_destino, "wb") as buffer:
                shutil.copyfileobj(archivo.file, buffer)
            url_multimedia = f"/uploads/{nombre_limpio}"

        # Si no se subió archivo pero se vinculó a un proyecto, ver si el proyecto tiene imagen
        if not url_multimedia and proyecto_id:
            proj = crud.obtener_proyecto_por_id(db, proyecto_id)
            if proj and proj.imagen_url:
                url_multimedia = proj.imagen_url
                tipo_media = "imagen"

        datos = {
            "proyecto_id": proyecto_id,
            "titulo": titulo,
            "resumen": resumen,
            "contenido": contenido,
            "multimedia_url": url_multimedia,
            "tipo_multimedia": tipo_media,
            "es_banner": es_banner,
            "categoria": categoria or "Noticias y Obras",
            "autor": autor or "Equigrup"
        }

        nueva_pub = crud.crear_publicacion(db, datos)
        return {
            "mensaje": "Publicación creada exitosamente para el blog y banner",
            "publicacion": nueva_pub.to_dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al publicar en el blog: {str(e)}")

@app.put("/api/blog/{pub_id}")
def actualizar_publicacion_blog_endpoint(pub_id: int, datos: dict, db: Session = Depends(get_db)):
    pub_act = crud.actualizar_publicacion(db, pub_id, datos)
    if not pub_act:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return {"mensaje": "Publicación actualizada exitosamente", "publicacion": pub_act.to_dict()}

@app.delete("/api/blog/{pub_id}")
def eliminar_publicacion_blog_endpoint(pub_id: int, db: Session = Depends(get_db)):
    exito = crud.eliminar_publicacion(db, pub_id)
    if not exito:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return {"mensaje": "Publicación eliminada exitosamente"}

@app.post("/api/blog/{pub_id}/toggle-banner")
def toggle_banner_endpoint(pub_id: int, db: Session = Depends(get_db)):
    pub = crud.alternar_banner_publicacion(db, pub_id)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return {
        "mensaje": "Estado de banner actualizado",
        "es_banner": bool(pub.es_banner),
        "publicacion": pub.to_dict()
    }

# --- SERVIR FRONTEND ---
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        # Retorna el icono del robot para evitar errores 404 en la terminal
        svg_favicon = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>"""
        return Response(content=svg_favicon, media_type="image/svg+xml")

    @app.get("/")
    def index():
        return FileResponse(
            str(FRONTEND_DIR / "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

