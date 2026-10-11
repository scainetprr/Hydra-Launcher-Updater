; Hydra Launcher - Custom NSIS Script
; Extiende el instalador NSIS generado por electron-builder

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WinCore.nsh"
!include "x64.nsh"

; ============================================================
; Variables personalizadas
; ============================================================
Var /GLOBAL HYDRA_DESKTOP_SHORTCUT
Var /GLOBAL HYDRA_STARTMENU_SHORTCUT
Var /GLOBAL HYDRA_LAUNCH_AFTER_INSTALL

; ============================================================
; Páginas personalizadas del instalador
; ============================================================

; Página de bienvenida personalizada
Function customWelcome
  !insertmacro MUI_HEADER_TEXT "Bienvenido al instalador de Hydra Launcher" "Instalará Hydra Launcher v${PRODUCT_VERSION} en su equipo"
FunctionEnd

; Página de componentes (opcional - aquí podrías agregar componentes)
Function customComponents
  ; Se ejecuta antes de la página de componentes
FunctionEnd

; Página de directorio personalizada
Function customDirectory
  !insertmacro MUI_HEADER_TEXT "Seleccionar carpeta de destino" "Elija dónde instalar Hydra Launcher"
FunctionEnd

; ============================================================
; Hooks del instalador
; ============================================================

; Se ejecuta antes de la instalación
Function .onInit
  ; Verificar si ya hay una instalación previa
  StrCpy $0 "$PROGRAMFILES64\Hydra Launcher"
  StrCpy $1 "$LOCALAPPDATA\Programs\Hydra Launcher"
  
  ; Configurar variables de acceso directo
  StrCpy $HYDRA_DESKTOP_SHORTCUT 1
  StrCpy $HYDRA_STARTMENU_SHORTCUT 1
  StrCpy $HYDRA_LAUNCH_AFTER_INSTALL 1
FunctionEnd

; Se ejecuta después de copiar archivos
Function .onInstFilesSuccess
  ; Crear clave de registro para "Abrir con" / protocolos si se desea
  ; WriteRegStr HKCU "Software\Hydra Launcher" "InstallPath" "$INSTDIR"
  ; WriteRegStr HKCU "Software\Hydra Launcher" "Version" "${PRODUCT_VERSION}"
  
  ; Registrar protocolo personalizado hydra:// si se desea
  ; System::Call 'shell32::SHChangeNotify(i, i, i, i) v(0x08000000, 0, 0, 0)'
FunctionEnd

; Se ejecuta al desinstalar
Function un.onUninstSuccess
  ; Limpiar claves de registro
  ; DeleteRegKey HKCU "Software\Hydra Launcher"
  ; System::Call 'shell32::SHChangeNotify(i, i, i, i) v(0x08000000, 0, 0, 0)'
FunctionEnd

; ============================================================
; Página final personalizada
; ============================================================
Function customFinish
  ; Mostrar checkbox "Ejecutar Hydra Launcher al terminar"
  !insertmacro MUI_HEADER_TEXT "Instalación completada" "Hydra Launcher se ha instalado correctamente"
  
  ; La opción runAfterFinish: true en package.json ya maneja esto
FunctionEnd

; ============================================================
; Sección de desinstalación personalizada
; ============================================================
Function un.onInit
  ; Confirmar desinstalación
  MessageBox MB_YESNO|MB_ICONQUESTION "¿Está seguro de que desea desinstalar Hydra Launcher?" IDYES +2
  Abort
FunctionEnd

; ============================================================
; Funciones auxiliares
; ============================================================

; Verificar si la aplicación está en ejecución
Function IsAppRunning
  ; Buscar proceso por nombre
  ; Retorna 1 si está corriendo, 0 si no
  Push $0
  Push $1
  StrCpy $0 0
  ${GetProcName} "$0" "Hydra Launcher.exe" $1
  StrCmp $1 "" 0 +2
  StrCpy $0 1
  Pop $1
  Pop $0
  Exch $0
FunctionEnd

; ============================================================
; Páginas MUI personalizadas (orden)
; ============================================================
; !insertmacro MUI_PAGE_WELCOME
; !insertmacro MUI_PAGE_LICENSE "build/LICENSE.txt"
; !insertmacro MUI_PAGE_DIRECTORY
; !insertmacro MUI_PAGE_INSTFILES
; !insertmacro MUI_PAGE_FINISH

; Las páginas se definen en package.json via electron-builder
; Este .nsh extiende la funcionalidad