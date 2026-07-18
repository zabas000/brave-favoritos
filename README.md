# Brave Favoritos Sync

Extensión de Brave para sincronizar marcadores en la nube.

## Backend (Render)

1. Crea un repositorio en GitHub y sube este código
2. En [render.com](https://render.com) crea un **Web Service** conectado al repo
3. Crea una **Base de Datos PostgreSQL** desde el Dashboard de Render
4. En el Web Service, agrega estas variables de entorno:
   - `DATABASE_URL`: copiada de la base de datos PostgreSQL
   - `JWT_SECRET`: una clave secreta
5. Render ejecutará `npm install` y `node server.js` automáticamente

## Extensión (Brave)

1. Abre `brave://extensions/`
2. Activa "Modo desarrollador"
3. "Cargar descomprimida" → selecciona `extension/`
4. En `extension/popup/popup.js` y `extension/background.js`, cambia `API_URL` por la URL de tu Render
