# Hydra Launcher

**Launcher exclusivo de Hydra Studio & HyperHard Network**

---

## 🎮 ¿Qué es Hydra Launcher?

Hydra Launcher es un **launcher personalizado de Minecraft Java Edition** desarrollado específicamente para la comunidad de **Hydra Studio & HyperHard Network**. Está diseñado para ofrecer una experiencia optimizada, segura y adaptada a los servidores y eventos de nuestra red.

> **⚡ Filosofía:** "Corta una cabeza, nacen dos" — Resiliencia, adaptabilidad y control total sobre tu experiencia de juego.

---

## 🌟 Características Principales

### 🎯 **Gestión de Versiones Inteligente**
- **Vanilla, Fabric y Forge** con instalación 1-click
- Detección automática de versiones ya instaladas en `.minecraft` (no re-descarga)
- Soporte para **snapshots, releases, old_alpha, old_beta**
- Filtrado y búsqueda por versión (ej: `1.20.1`, `26.2`, `1.16.5`)

### 🧱 **Sistema de Modpacks Avanzado**
- **Escaneo recursivo** de `mods/` (incluye subcarpetas)
- **Crear/Editar/Eliminar** modpacks con interfaz visual
- **Aplicar modpacks** con un click
- Guardado persistente en `hydra-modpacks.json`

### 🔐 **Autenticación Dual**
| Tipo | Descripción |
|------|-------------|
| **Microsoft (Premium)** | OAuth2 nativo con `msmc`, refresh token automático, auto-actualización de sesión |
| **Offline (No-Premium)** | UUID v3 determinístico (namespace DNS) — compatible con servidores `online-mode=false` |

### ⚙️ **Optimización y Rendimiento**
- **RAM dinámica** — Detección automática de RAM del sistema (hasta 8GB+)
- **Java auto-detect** — Adoptium, Oracle, PATH (prioriza Java 21 para 1.20.5+)
- **JVM args optimizados** — G1GC, string deduplication, flags de rendimiento

### 🌐 **Servidores Integrados**
- **Quick-Join** — Conectar directo desde el launcher
- **Ping en tiempo real** — Estado online/offline + latencia
- Servidores preconfigurados: Eventos, Survival, OneBlock, Lobby

### 📦 **Auto-Updater Nativo**
- **GitHub Releases** como backend
- Descarga silenciosa en background
- Instalación automática al cerrar
- `latest.yml` con SHA512 + verificación de integridad

### 🖥️ **Interfaz Premium Dark**
- Tema **Hydra Dark** con glassmorphism
- Animaciones fluidas, glass cards, neon accents
- Sidebar navegable: Inicio • Versiones • Servidores • Modpacks • Cuentas • Ajustes
- Consola integrada con auto-scroll + pausa manual

---

## 📦 **Formatos de Distribución**

| Formato | Tamaño | Uso |
|---------|--------|-----|
| **Instalador `.exe`** (Inno Setup) | ~75 MB | Instalación completa con shortcuts, desinstalador, registro Windows |
| **Portable `.zip`** | ~113 MB | Sin instalación, ejecuta directo, ideal para USB |

---

## 🔧 **Requisitos del Sistema**

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| **OS** | Windows 7/8/10/11 (64-bit) | Windows 10/11 64-bit |
| **Java** | Java 17+ (auto-detectado) | Java 21 (Adoptium) |
| **RAM** | 4 GB | 8 GB+ |
| **Disco** | 500 MB + mods | 2 GB+ |
| **Red** | Para auth y servidores | Estable |

---

## 🚀 **Instalación Rápida**

### Opción A: Instalador (Recomendado)
1. Descarga `Hydra-Launcher-Setup-v1.0.0.exe`
2. Ejecuta → Sigue el wizard → Elige carpeta → Marca "Ejecutar al finalizar"
2. ¡Listo! Accesos directos en Escritorio + Menú Inicio

### Opción B: Portable
1. Descarga `Hydra-Launcher-Portable-v1.0.0.zip`
2. Extrae en cualquier carpeta
3. Ejecuta `Hydra Launcher.exe`
3. Ideal para USB, sin instalación, sin registro

---

## 🎯 **Primer Uso**

1. **Cuentas** → `Microsoft →` (login OAuth) **o** `Añadir offline` (nombre + enter)
2. **Versiones** → Selecciona versión (ej. `26.2`) + `Fabric (1-click)`
3. **Modpacks** → `Crear modpack` desde tus mods actuales
4. **Servidores** → Elige servidor → `JUGAR` (quick-join automático)
4. **JUGAR** → ¡Disfruta!

---

## 🔐 **Seguridad y Privacidad**

- **Sin telemetría oculta** — Solo logs locales en `Ajustes → Logs`
- **Tokens Microsoft** — Guardados cifrados localmente (`hydra-accounts.json`), refresh automático
- **Código abierto** — Repositorio: `scainetprr/Hydra-Launcher-Updater`
- **Sin bundleware** — Solo lo necesario para jugar

---

## 🌐 **Distribución Web**

### ¿Puedo poner el instalador en una página web?

**¡SÍ!** Tienes **3 opciones**:

#### 1. **GitHub Releases (Actual — Gratis y Automático)**
- URL directa: `https://github.com/scainetprr/Hydra-Launcher-Updater/releases/latest`
- El auto-updater ya usa esto
- **Pros:** Gratis, CDN global, HTTPS, versionado automático
- **Contras:** UI de GitHub, no tu branding

#### 2. **Tu propia web (Recomendado para branding tipo TLauncher)**
```html
<!-- Ejemplo simple -->
<a href="https://github.com/scainetprr/Hydra-Launcher-Updater/releases/download/v1.0.0/Hydra-Launcher-Setup-v1.0.0.exe" 
   class="btn btn-primary">
  Descargar Hydra Launcher v1.0.0
</a>
```
- Sube el `.exe` y `.zip` a tu hosting/CDN
- Crea landing page con tu branding Hydra
- **Control total** sobre UX, métricas, SEO

#### 3. **GitHub Pages (Gratis, en tu repo)**
- Activa **Settings → Pages → Deploy from branch → gh-pages**
- Crea `index.html` en rama `gh-pages` o carpeta `/docs`
- URL: `https://scainetprr.github.io/Hydra-Launcher-Updater/`
- **Gratis, HTTPS, dominio personalizable** (`launcher.hydrastudio.com` con CNAME)

---

## 📄 **Licencia y Créditos**

```
Hydra Launcher v1.0.0
Copyright © 2026 Dylan David Gomez (scainetprr)
Hydra Studio & HyperHard Network

Launcher exclusivo para la comunidad de Hydra Studio & HyperHard Network.
Prohibida su redistribución, modificación o uso comercial sin autorización.

Tecnologías: Electron, React, Vite, TailwindCSS, Inno Setup, electron-updater, msmc, minecraft-launcher-core
```

---

## 📞 **Soporte y Comunidad**

- **Discord:** https://discord.gg/qyyREajJgC (Hydra Studio)
- **Issues:** https://github.com/scainetprr/Hydra-Launcher-Updater/issues
- **Desarrollador:** scainetprr (1307246359895740448)

---

> **Hydra Launcher — Hecho por y para Hydra Studio & HyperHard Network**  
> *Corta una cabeza, nacen dos.*