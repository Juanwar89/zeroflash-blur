# ZeroFlash Blur — Guía Rápida de Prueba y Publicación (Versión Gratis)

Esta carpeta contiene la edición **100% gratuita** lista para publicar en Chrome Web Store bajo cuenta **No comerciante** (sin muro de pago ni verificación de dirección comercial):

* `extension/` — Extensión de Chrome (**Manifest V3**, sin dependencias ni servidor externo; todo corre local).
* `landing/` — Landing page bilingüe (EN/ES) con **Sandbox interactivo** para probar y demostrar la extensión.
* `scripts/package_extension.py` — Empaquetador `.zip` listo para Chrome Web Store (`dist/`).
* `backend/` — Servidor de licencias y webhooks en Python + SQLite **conservado en el repositorio** para cuando en el futuro verifiques tu perfil como **Comerciante** y quieras habilitar un plan Pro.

---

## 1. Probar todo en tu PC en 1 minuto

### Paso A: Levantar la Landing + Sandbox de prueba
```powershell
cd C:\Users\juanc\Downloads\IA
python -m http.server 8080 --directory landing
```
Abre `http://localhost:8080` en Google Chrome. *(Ya no necesitas iniciar servidor de licencias para probar).*

### Paso B: Cargar la extensión en Google Chrome
1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta `extension/`.
4. Fija el icono de **ZeroFlash Blur** en la barra superior.

### Paso C: Probar todas las funciones sobre el Sandbox
1. En `http://localhost:8080`, abre la extensión y haz clic en **"Clic para Difuminar"** (`Alt+Shift+B`) → haz clic sobre cualquier saldo o fila de la tabla.
2. Prueba **"Escudo Pánico"** (`Alt+Shift+P`) para tapar toda la pestaña al instante.
3. Activa **"Autoproteger al recargar"** y **"Detectar datos sensibles"** directamente (sin licencias; Chrome pedirá permiso solo para `localhost:8080`).
4. Recarga la página (`F5`) y haz clic en **"+ Simular Fila Dinámica SPA"** para verificar que las filas nuevas se difuminan al instante sin romper la página.

---

## 2. Configurar tu enlace de apoyo / donaciones (Opcional)

La extensión incluye un enlace discreto de apoyo (**"Apoyar este proyecto gratis ♥"**) que actualmente apunta a `https://github.com/Juanwar89`.
Si creas un perfil en **Ko-fi**, **Buy Me a Coffee** o **GitHub Sponsors**:
1. Edita `SUPPORT_URL` en `extension/shared/common.js` y el enlace `#supportLink` en `landing/index.html`.
2. Vuelve a empaquetar el `.zip` antes de subirlo a Chrome Web Store.

---

## 3. Publicar en Chrome Web Store (como "No comerciante")

1. Ejecuta:
   ```powershell
   python scripts/package_extension.py
   ```
   Se generará `dist/zeroflash-blur-v1.0.0.zip`.
2. En el **Panel del desarrollador de Chrome Web Store → Configuración**:
   * Agrega y verifica tu correo de contacto.
   * Selecciona **"Esta es una cuenta de no comerciante"** (si la publicas como proyecto personal 100% gratuito sin verificación comercial).
3. Ve a **Elementos**, sube `dist/zeroflash-blur-v1.0.0.zip` e incluye 4–5 capturas limpias (1280×800) tomadas sobre el Sandbox.
4. **Justificación de permisos en el formulario de Google:**
   * `activeTab`: difuminar elementos cuando el usuario hace clic en la extensión.
   * `storage`: guardar reglas CSS y preferencias localmente.
   * `scripting`: inyectar estilos de difuminado en el sitio activo.
   * `optional_host_permissions`: solicitado únicamente si el usuario activa la autoprotección al recargar en un dominio específico.

---

## 4. Próximo paso cuando quieras monetizar (Portafolio + Plan Pro futuro)
* Usa el enlace publicado en **Chrome Web Store** dentro de tu **CV** y **GitHub** (`github.com/Juanwar89`): tener una extensión publicada en la tienda oficial de Google suma mucha credibilidad para conseguir prácticas o primer empleo.
* Cuando obtengas un extracto bancario en PDF con tu dirección y completes la verificación como **Comerciante**, puedes activar la rama con `backend/` para vender funciones Pro.
