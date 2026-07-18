# Brave Favoritos Sync

Sincroniza tus marcadores de Brave en la nube.

## 📦 Descargar la extensión

Solo necesitas la carpeta [`extension/`](extension/):

**Opción A — Descargar todo el repo:**
```bash
git clone https://github.com/zabas000/brave-favoritos.git
```
Luego abre `brave://extensions/`, activa "Modo desarrollador", y carga la carpeta `extension/`.

**Opción B — Solo la extensión:**
Entra a https://github.com/zabas000/brave-favoritos/tree/master/extension y descarga los archivos.

## 🚀 Cómo usarla

1. Abre `brave://extensions/`
2. Activa **"Modo desarrollador"** (arriba a la derecha)
3. Haz clic en **"Cargar descomprimida"**
4. Selecciona la carpeta `extension/`
5. Haz clic en el icono de la extensión → **Crear cuenta**
6. **Subir a la nube** → guarda tus marcadores
7. En otro PC: instala la extensión, inicia sesión y los marcadores se descargan solos

## 🖥️ Backend (solo para desarrolladores)

El servidor ya está corriendo en `https://brave-favoritos.onrender.com`. Si quieres tu propio servidor:

```bash
cd server
npm install
npm start
```
