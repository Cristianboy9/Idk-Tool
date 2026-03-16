// Variables para image logger
let imagenActual = null;

// Configurar drag & drop
const dropArea = document.getElementById('dropArea');
const imageInput = document.getElementById('imageInput');

if (dropArea) {
    dropArea.addEventListener('click', () => imageInput.click());
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('border-red-600');
    });
    
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('border-red-600');
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('border-red-600');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            imageInput.files = files;
            previsualizarImagen(files[0]);
        }
    });
    
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            previsualizarImagen(e.target.files[0]);
        }
    });
}

// Previsualizar imagen seleccionada
function previsualizarImagen(file) {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('previewArea').classList.remove('hidden');
            document.getElementById('dropArea').classList.add('hidden');
            imagenActual = file;
        };
        reader.readAsDataURL(file);
    }
}

// Subir imagen al servidor
async function subirImagen() {
    if (!imagenActual) {
        alert('❌ Selecciona una imagen primero');
        return;
    }

    const btn = document.getElementById('uploadBtn');
    btn.innerText = '📤 SUBIENDO...';
    
    const formData = new FormData();
    formData.append('image', imagenActual);

    try {
        const res = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Mostrar links generados
            document.getElementById('loggerUrl').innerText = data.loggerUrl;
            document.getElementById('discordUrl').innerText = data.discordPreview;
            document.getElementById('previewDiscord').src = data.previewUrl;
            document.getElementById('generatedLinks').classList.remove('hidden');
            
            // Resetear UI
            document.getElementById('previewArea').classList.add('hidden');
            document.getElementById('dropArea').classList.remove('hidden');
            imagenActual = null;
            imageInput.value = '';
            
            // Cargar lista actualizada
            cargarImagenes();
            
            notificar('✅ IMAGEN SUBIDA', 'Link generado correctamente');
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
    
    btn.innerText = '📤 SUBIR IMAGEN';
}

// Cargar lista de imágenes subidas
async function cargarImagenes() {
    try {
        const res = await fetch('/api/images');
        const images = await res.json();
        
        const list = document.getElementById('imagesList');
        list.innerHTML = images.map(img => `
            <div class="bg-black/50 p-2 rounded border border-red-900/30">
                <img src="${img.url}" class="w-full h-16 object-cover rounded mb-2">
                <div class="text-[8px] font-mono text-gray-500 truncate">${img.originalName}</div>
                <div class="text-[8px] text-red-600">${img.views} vistas</div>
                <button onclick="copiarTextoDirecto('${img.loggerUrl}')" 
                    class="text-[8px] text-red-400 hover:text-red-600 mt-1">
                    📋 COPIA
                </button>
            </div>
        `).join('');
    } catch (e) {}
}

// Funciones para copiar texto
function copiarTexto(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text);
    notificar('📋 COPIADO', 'URL en el portapapeles');
}

function copiarTextoDirecto(text) {
    navigator.clipboard.writeText(text);
    notificar('📋 COPIADO', 'URL en el portapapeles');
}

// Cargar imágenes al iniciar
setInterval(cargarImagenes, 10000);
cargarImagenes();
