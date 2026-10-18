/**
 * ==============================================================================
 * EQUIGRUP - GESTOR DE OPERACIONES & ASISTENTE INTELIGENTE
 * ARQUITECTURA MVVM (Model - View - ViewModel)
 * ==============================================================================
 * 
 * ESTRUCTURA DEL SISTEMA:
 * 1. MODEL (M):
 *    - AuthModel: Gestión de sesiones, login, y recuperación de contraseñas por OTP.
 *    - ProjectModel: Comunicación REST con la base de datos de proyectos (/api/proyectos).
 *    - ChatModel: Conexión con el agente de IA y motor RAG (/chat).
 *    - BlogModel: Gestión de publicaciones y banner web hero (/api/blog).
 * 
 * 2. VIEWMODEL (VM):
 *    - AuthViewModel: Estado observable de autenticación y seguridad.
 *    - ProjectsViewModel: Estado reactivo de proyectos, filtros y operaciones CRUD.
 *    - ChatViewModel: Estado de la conversación, procesamiento Markdown y documentos.
 *    - BlogViewModel: Estado del feed de noticias y banner destacado.
 * 
 * 3. VIEW (V):
 *    - index.html + styles.css: Interfaz gráfica desacoplada.
 *    - AppView: Controlador de renderizado y enlace con el DOM.
 * ==============================================================================
 */

// --- 1. INSTANCIACIÓN DE COMPONENTES MVVM ---
const authModel = new AuthModel();
const projectModel = new ProjectModel();
const chatModel = new ChatModel();
const blogModel = new BlogModel();

const authViewModel = new AuthViewModel(authModel);
const projectsViewModel = new ProjectsViewModel(projectModel);
const chatViewModel = new ChatViewModel(chatModel);
const blogViewModel = new BlogViewModel(blogModel, projectModel);

const appView = new AppView(authViewModel, projectsViewModel, chatViewModel, blogViewModel);

// Exposición pública del espacio de nombres MVVM para inspección y sustentación
window.EquiMVVM = {
    Models: {
        Auth: authModel,
        Project: projectModel,
        Chat: chatModel,
        Blog: blogModel
    },
    ViewModels: {
        Auth: authViewModel,
        Projects: projectsViewModel,
        Chat: chatViewModel,
        Blog: blogViewModel
    },
    View: appView
};

// --- 2. INICIALIZACIÓN DE LA APLICACIÓN ---
window.addEventListener('DOMContentLoaded', () => {
    appView.init();
});

// --- 3. PROXIES DE CONTROLADORES Y ENLACE DE EVENTOS (VIEW-MODEL BINDINGS) ---

// A. NAVEGACIÓN Y VISTAS
function cambiarVista(vista) {
    appView.switchMainView(vista);
}

// B. AUTENTICACIÓN Y SEGURIDAD
function verificarEstadoAutenticacion() {
    authViewModel.init();
}

function mostrarVistaAuth(vista) {
    authViewModel.switchView(vista);
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (btn) btn.textContent = '🙈';
    } else {
        input.type = 'password';
        if (btn) btn.textContent = '👁️';
    }
}

async function ejecutarLogin(event) {
    event.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    const msgBox = document.getElementById('authLoginMsg');
    const usuario = document.getElementById('loginUsuario').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!usuario || !password) return;

    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Verificando credenciales...';
    if (msgBox) msgBox.style.display = 'none';

    try {
        const data = await authViewModel.login(usuario, password);

        if (msgBox) {
            msgBox.className = 'auth-msg-box auth-msg-success';
            msgBox.textContent = `✅ ${data.mensaje || 'Acceso concedido. Entrando al sistema...'}`;
            msgBox.style.display = 'block';
        }

        setTimeout(() => {
            appView.renderAuth(authViewModel);
            projectsViewModel.loadProjects();
            const userInput = document.getElementById('userInput');
            if (userInput) userInput.focus();
        }, 500);

    } catch (error) {
        if (msgBox) {
            msgBox.className = 'auth-msg-box auth-msg-error';
            msgBox.textContent = `❌ ${error.message}`;
            msgBox.style.display = 'block';
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span> Iniciar Sesión';
    }
}

async function solicitarCodigoRecuperacion(event) {
    event.preventDefault();
    const btn = document.getElementById('btnRecuperarSubmit');
    const msgBox = document.getElementById('authRecuperarMsg');
    const identificador = document.getElementById('recuperarIdentificador').value.trim();

    if (!identificador) return;

    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Enviando código de seguridad...';
    if (msgBox) msgBox.style.display = 'none';

    try {
        const data = await authViewModel.requestOtp(identificador);

        document.getElementById('resetEmailHidden').value = data.email;
        const lbl = document.getElementById('correoDestinoLabel');
        if (lbl) lbl.textContent = data.email;

        const msgCambiar = document.getElementById('authCambiarMsg');
        if (msgCambiar) {
            msgCambiar.className = 'auth-msg-box auth-msg-info';
            let devNotice = data.codigo_dev ? `<br><small style="margin-top: 4px; display: block; color: #f59e0b;">(Modo Local: Código <strong>${data.codigo_dev}</strong>)</small>` : '';
            msgCambiar.innerHTML = `📨 ${data.mensaje}${devNotice}`;
            msgCambiar.style.display = 'block';
        }

    } catch (error) {
        if (msgBox) {
            msgBox.className = 'auth-msg-box auth-msg-error';
            msgBox.textContent = `❌ ${error.message}`;
            msgBox.style.display = 'block';
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📨</span> Enviar Código de Verificación';
    }
}

async function guardarNuevaPassword(event) {
    event.preventDefault();
    const btn = document.getElementById('btnCambiarPassSubmit');
    const msgBox = document.getElementById('authCambiarMsg');
    const email = document.getElementById('resetEmailHidden').value;
    const codigo = document.getElementById('resetCodigoOtp').value.trim();
    const nuevaPass = document.getElementById('resetNuevaPassword').value;
    const confirmarPass = document.getElementById('resetConfirmarPassword').value;

    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Actualizando contraseña...';

    try {
        const data = await authViewModel.resetPassword(email, codigo, nuevaPass, confirmarPass);

        if (msgBox) {
            msgBox.className = 'auth-msg-box auth-msg-success';
            msgBox.textContent = '✅ ¡Contraseña actualizada exitosamente! Redirigiendo al login...';
            msgBox.style.display = 'block';
        }

        setTimeout(() => {
            authViewModel.switchView('login');
            const loginPass = document.getElementById('loginPassword');
            if (loginPass) loginPass.value = nuevaPass;
            const loginUser = document.getElementById('loginUsuario');
            if (loginUser) loginUser.value = 'freddy';
        }, 1500);

    } catch (error) {
        if (msgBox) {
            msgBox.className = 'auth-msg-box auth-msg-error';
            msgBox.textContent = `❌ ${error.message}`;
            msgBox.style.display = 'block';
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Actualizar Contraseña e Ingresar';
    }
}

function cerrarSesion() {
    if (confirm('¿Deseas cerrar tu sesión de Equigrup?')) {
        authViewModel.logout();
    }
}

// C. CHAT CON EQUI
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        document.getElementById('chatForm').requestSubmit();
    }
}

async function enviarMensajeChat(event) {
    event.preventDefault();
    const input = document.getElementById('userInput');
    const mensaje = input ? input.value.trim() : '';
    if (!mensaje) return;

    input.value = '';
    input.style.height = 'auto';

    await chatViewModel.sendMessage(mensaje);
    if (input) input.focus();
}

function consultarEquiSobreProyecto(titulo) {
    cambiarVista('chat');
    const input = document.getElementById('userInput');
    if (input) {
        input.value = `¿Qué información técnica y trabajos tenemos registrados sobre "${titulo}"?`;
        document.getElementById('chatForm').requestSubmit();
    }
}

// D. PROYECTOS Y CATÁLOGO
function cargarProyectos() {
    projectsViewModel.loadProjects();
}

function filtrarProyectos() {
    const inputBusqueda = document.getElementById('searchProyectosInput');
    const inputEstado = document.getElementById('filterEstado');
    const inputCat = document.getElementById('filterCategoria');

    projectsViewModel.setFilters(
        inputBusqueda ? inputBusqueda.value : '',
        inputEstado ? inputEstado.value : '',
        inputCat ? inputCat.value : ''
    );
}

function limpiarFiltros() {
    const inputBusqueda = document.getElementById('searchProyectosInput');
    const inputEstado = document.getElementById('filterEstado');
    const inputCat = document.getElementById('filterCategoria');
    if (inputBusqueda) inputBusqueda.value = '';
    if (inputEstado) inputEstado.value = '';
    if (inputCat) inputCat.value = '';

    projectsViewModel.clearFilters();
}

async function guardarProyecto(event) {
    event.preventDefault();
    const btn = document.getElementById('btnGuardarProyecto');
    const msgEstado = document.getElementById('msgProyectoEstado');
    btn.disabled = true;
    msgEstado.textContent = 'Guardando en la base de datos...';
    msgEstado.style.color = '#38bdf8';

    try {
        const fotoInput = document.getElementById('projFoto');
        const archivoFoto = (fotoInput && fotoInput.files.length > 0) ? fotoInput.files[0] : null;

        const datosProyecto = {
            titulo: document.getElementById('projTitulo').value,
            cliente: document.getElementById('projCliente').value,
            ubicacion: document.getElementById('projUbicacion').value,
            categoria: document.getElementById('projCategoria').value,
            estado: document.getElementById('projEstado').value,
            maquinaria: document.getElementById('projMaquinaria').value,
            descripcion: document.getElementById('projDescripcion').value
        };

        await projectsViewModel.saveProject(datosProyecto, archivoFoto);

        msgEstado.textContent = '✅ ¡Proyecto guardado exitosamente!';
        msgEstado.style.color = '#10b981';
        document.getElementById('formProyecto').reset();

        setTimeout(() => {
            msgEstado.textContent = '';
            cambiarVista('proyectos');
        }, 1000);

    } catch (error) {
        msgEstado.textContent = `❌ Error: ${error.message}`;
        msgEstado.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
    }
}

function abrirModalEditarPorId(id) {
    const proyecto = projectsViewModel.getProjectById(id);
    if (!proyecto) return;

    document.getElementById('editProjId').value = proyecto.id;
    document.getElementById('editProjTitulo').value = proyecto.titulo || '';
    document.getElementById('editProjCliente').value = proyecto.cliente || '';
    document.getElementById('editProjUbicacion').value = proyecto.ubicacion || '';
    document.getElementById('editProjCategoria').value = proyecto.categoria || 'Informe Técnico';
    document.getElementById('editProjEstado').value = proyecto.estado || 'Completado';
    document.getElementById('editProjMaquinaria').value = proyecto.maquinaria || '';
    document.getElementById('editProjDescripcion').value = proyecto.descripcion || '';
    document.getElementById('modalEditar').style.display = 'flex';
}

function cerrarModalEditar() {
    document.getElementById('modalEditar').style.display = 'none';
}

async function guardarEdicionProyecto(event) {
    event.preventDefault();
    const id = document.getElementById('editProjId').value;
    const datos = {
        titulo: document.getElementById('editProjTitulo').value.trim(),
        cliente: document.getElementById('editProjCliente').value.trim(),
        ubicacion: document.getElementById('editProjUbicacion').value.trim(),
        categoria: document.getElementById('editProjCategoria').value,
        estado: document.getElementById('editProjEstado').value,
        maquinaria: document.getElementById('editProjMaquinaria').value.trim(),
        descripcion: document.getElementById('editProjDescripcion').value.trim()
    };

    try {
        await projectsViewModel.updateProject(id, datos);
        cerrarModalEditar();
    } catch (e) {
        alert('Error al actualizar: ' + e.message);
    }
}

async function eliminarProyecto(id, titulo) {
    if (!confirm(`¿Eliminar el proyecto:\n"${titulo}"?`)) {
        return;
    }

    try {
        await projectsViewModel.deleteProject(id);
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
}

function mostrarAvisoSinDoc(titulo, id) {
    if (confirm(`ℹ️ El proyecto "${titulo}" está registrado en la base de datos de Equigrup, pero aún no tiene un archivo PDF o informe digital adjunto en el servidor.\n\n¿Deseas ir al módulo "Subir Multimedia" para adjuntarle un archivo o fotografía?`)) {
        cambiarVista('multimedia');
        const select = document.getElementById('mediaProyectoSelect');
        if (select) select.value = id;
    }
}

// E. MULTIMEDIA
async function subirMultimedia(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSubirMedia');
    const msgEstado = document.getElementById('msgMediaEstado');
    const archivoInput = document.getElementById('mediaArchivo');
    const proyectoId = document.getElementById('mediaProyectoSelect').value;
    const titulo = document.getElementById('mediaTitulo').value.trim();

    if (!archivoInput.files.length) return;

    btn.disabled = true;
    msgEstado.textContent = 'Subiendo archivo...';
    msgEstado.style.color = '#38bdf8';

    try {
        const formData = new FormData();
        formData.append('archivo', archivoInput.files[0]);
        formData.append('titulo', titulo);
        if (proyectoId) formData.append('proyecto_id', proyectoId);

        await projectModel.subirArchivo(formData);

        msgEstado.textContent = '✅ ¡Archivo subido correctamente!';
        msgEstado.style.color = '#10b981';
        document.getElementById('formMedia').reset();

        setTimeout(() => {
            msgEstado.textContent = '';
        }, 2000);

    } catch (error) {
        msgEstado.textContent = `❌ Error: ${error.message}`;
        msgEstado.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
    }
}

// F. BLOG & BANNER WEB
function cambiarPestanaBlog(pestana) {
    const btnPub = document.getElementById('tabBtnBlogPublicar');
    const btnFeed = document.getElementById('tabBtnBlogFeed');
    const secPub = document.getElementById('seccionBlogPublicar');
    const secFeed = document.getElementById('seccionBlogFeed');

    if (pestana === 'publicar') {
        if (btnPub) {
            btnPub.style.background = '#2563eb';
            btnPub.style.color = '#fff';
            btnPub.style.borderColor = '#3b82f6';
        }
        if (btnFeed) {
            btnFeed.style.background = '#0f172a';
            btnFeed.style.color = '#cbd5e1';
            btnFeed.style.borderColor = '#334155';
        }
        if (secPub) secPub.style.display = 'block';
        if (secFeed) secFeed.style.display = 'none';
        blogViewModel.setTab('publicar');
    } else {
        if (btnFeed) {
            btnFeed.style.background = '#2563eb';
            btnFeed.style.color = '#fff';
            btnFeed.style.borderColor = '#3b82f6';
        }
        if (btnPub) {
            btnPub.style.background = '#0f172a';
            btnPub.style.color = '#cbd5e1';
            btnPub.style.borderColor = '#334155';
        }
        if (secPub) secPub.style.display = 'none';
        if (secFeed) secFeed.style.display = 'block';
        blogViewModel.setTab('feed');
        blogViewModel.loadPosts();
    }
}

function autocompletarDesdeProyecto() {
    const select = document.getElementById('blogProyectoSelect');
    if (!select || !select.value) return;

    const p = blogViewModel.getProjectForAutofill(select.value);
    if (!p) return;

    const tituloInput = document.getElementById('blogTitulo');
    const resumenInput = document.getElementById('blogResumen');
    const contenidoInput = document.getElementById('blogContenido');
    const categoriaSelect = document.getElementById('blogCategoria');

    if (tituloInput) tituloInput.value = p.titulo || '';
    if (resumenInput) {
        const clienteTxt = p.cliente ? ` para ${p.cliente}` : '';
        const maqTxt = p.maquinaria ? ` en ${p.maquinaria}` : '';
        resumenInput.value = `Proyecto de ${p.categoria || 'ingeniería'}${clienteTxt}${maqTxt}.`;
    }
    if (contenidoInput) {
        let texto = `${p.descripcion || ''}\n\nDetalles Técnicos de la Obra:\n- Cliente: ${p.cliente || 'No especificado'}\n- Ubicación: ${p.ubicacion || 'Planta'}\n- Maquinaria/Equipos: ${p.maquinaria || 'No especificada'}\n- Estado: ${p.estado || 'Completado'}`;
        contenidoInput.value = texto.trim();
    }
    if (categoriaSelect && p.categoria) {
        if (p.categoria.toLowerCase().includes('instalaci')) categoriaSelect.value = 'Instalación & Montaje';
        else if (p.categoria.toLowerCase().includes('manten')) categoriaSelect.value = 'Mantenimiento Industrial';
        else categoriaSelect.value = 'Obras y Proyectos Destacados';
    }
}

function previsualizarMultimediaBlog(input) {
    const previewContainer = document.getElementById('blogMediaPreview');
    const dropzoneContent = document.getElementById('blogDropzoneContent');
    if (!previewContainer) return;

    if (input.files && input.files[0]) {
        const file = input.files[0];
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name);
        const fileUrl = URL.createObjectURL(file);

        if (dropzoneContent) dropzoneContent.style.display = 'none';
        previewContainer.style.display = 'block';

        if (isVideo) {
            previewContainer.innerHTML = `
                <div style="max-width: 100%; border-radius: 8px; overflow: hidden; position: relative;">
                    <video controls autoplay muted loop style="width: 100%; max-height: 260px; object-fit: contain; background: #000; border-radius: 8px;">
                        <source src="${fileUrl}" type="${file.type || 'video/mp4'}">
                        Tu navegador no soporta el reproductor de video.
                    </video>
                    <div style="margin-top: 8px; font-size: 12.5px; color: #38bdf8; font-weight: 600;">
                        🎬 Video seleccionado: ${file.name} (${(file.size / (1024*1024)).toFixed(2)} MB)
                    </div>
                </div>
            `;
        } else {
            previewContainer.innerHTML = `
                <div style="max-width: 100%; border-radius: 8px; overflow: hidden;">
                    <img src="${fileUrl}" alt="Preview" style="width: 100%; max-height: 260px; object-fit: cover; border-radius: 8px; border: 1px solid #38bdf8;">
                    <div style="margin-top: 8px; font-size: 12.5px; color: #38bdf8; font-weight: 600;">
                        📸 Imagen seleccionada: ${file.name}
                    </div>
                </div>
            `;
        }
    }
}

function limpiarFormularioBlog() {
    const form = document.getElementById('formPublicarBlog');
    if (form) form.reset();
    const preview = document.getElementById('blogMediaPreview');
    const dropzoneContent = document.getElementById('blogDropzoneContent');
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
    if (dropzoneContent) dropzoneContent.style.display = 'block';
    const select = document.getElementById('blogProyectoSelect');
    if (select) select.value = '';
}

async function guardarPublicacionBlog(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitBlog');
    const msg = document.getElementById('msgBlogEstado');
    const titulo = document.getElementById('blogTitulo').value.trim();
    const resumen = document.getElementById('blogResumen').value.trim();
    const contenido = document.getElementById('blogContenido').value.trim();
    const categoria = document.getElementById('blogCategoria').value;
    const esBanner = document.getElementById('blogEsBanner').checked;
    const autor = document.getElementById('blogAutor').value.trim() || 'Equigrup';
    const proyectoId = document.getElementById('blogProyectoSelect').value;
    const archivoInput = document.getElementById('blogArchivoInput');

    if (!titulo || !contenido) {
        alert('Por favor completa el título y el contenido de la publicación.');
        return;
    }

    btn.disabled = true;
    msg.textContent = '⏳ Publicando en el portal y banner...';
    msg.style.color = '#38bdf8';

    try {
        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('resumen', resumen);
        formData.append('contenido', contenido);
        formData.append('categoria', categoria);
        formData.append('es_banner', esBanner);
        formData.append('autor', autor);
        if (proyectoId) formData.append('proyecto_id', proyectoId);
        if (archivoInput.files && archivoInput.files[0]) {
            formData.append('archivo', archivoInput.files[0]);
        }

        await blogViewModel.publishPost(formData);

        msg.textContent = '✅ ¡Publicado exitosamente en el Blog y Banner Web!';
        msg.style.color = '#10b981';

        setTimeout(() => {
            msg.textContent = '';
            limpiarFormularioBlog();
            cambiarPestanaBlog('feed');
        }, 1200);

    } catch (e) {
        msg.textContent = `❌ Error: ${e.message}`;
        msg.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
    }
}

async function toggleBannerPublicacion(id) {
    try {
        await blogViewModel.toggleBanner(id);
    } catch (e) {
        alert(`Error: ${e.message}`);
    }
}

async function eliminarPublicacionBlog(id, titulo) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la publicación "${titulo}" del blog y banner?`)) return;
    try {
        await blogViewModel.deletePost(id);
    } catch (e) {
        alert(`Error: ${e.message}`);
    }
}

function abrirModalEditarBlog(id) {
    const pub = blogViewModel.getPostById(id);
    if (!pub) return;

    document.getElementById('editBlogId').value = pub.id;
    document.getElementById('editBlogTitulo').value = pub.titulo || '';
    document.getElementById('editBlogResumen').value = pub.resumen || '';
    document.getElementById('editBlogContenido').value = pub.contenido || '';
    document.getElementById('editBlogCategoria').value = pub.categoria || 'Obras y Proyectos Destacados';
    document.getElementById('editBlogEsBanner').checked = Boolean(pub.es_banner);

    document.getElementById('modalEditarBlog').style.display = 'flex';
}

function cerrarModalEditarBlog() {
    document.getElementById('modalEditarBlog').style.display = 'none';
}

async function guardarEdicionBlog(event) {
    event.preventDefault();
    const id = document.getElementById('editBlogId').value;
    const datos = {
        titulo: document.getElementById('editBlogTitulo').value.trim(),
        resumen: document.getElementById('editBlogResumen').value.trim(),
        contenido: document.getElementById('editBlogContenido').value.trim(),
        categoria: document.getElementById('editBlogCategoria').value,
        es_banner: document.getElementById('editBlogEsBanner').checked
    };

    try {
        await blogViewModel.updatePost(id, datos);
        cerrarModalEditarBlog();
    } catch (e) {
        alert(`Error: ${e.message}`);
    }
}

// G. HELPERS UI
function mostrarNombreArchivo(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input && input.files && input.files[0] && label) {
        label.textContent = "📄 Archivo seleccionado: " + input.files[0].name;
    }
}
