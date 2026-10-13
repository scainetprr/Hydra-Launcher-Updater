; ============================================================================
; Hydra Launcher - Inno Setup Script
; Genera instalador profesional .exe tipo TLauncher
; ============================================================================
; Compilar con: iscc "E:\Launcher\build\HydraLauncher.iss"
; Requiere: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
; ============================================================================

#define MyAppName "Hydra Launcher"
#define MyAppVersion "1.3.3"
#define MyAppPublisher "Hydra Studio (scainetprr)"
#define MyAppURL "https://discord.gg/qyyREajJgC"
#define MyAppExeName "Hydra Launcher.exe"
#define MyAppCopyright "Copyright © 2026 Dylan David Gomez"

; Directorio fuente (donde está win-unpacked)
#define SourceDir "E:\Launcher\release\win-unpacked"
; Directorio salida
#define OutputDir "E:\Launcher\release"
#define OutputBaseName "Hydra-Launcher-Setup-v" + MyAppVersion

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=hydra-icon.ico
LicenseFile=LICENSE.txt
InfoBeforeFile=InfoBefore.txt
InfoAfterFile=InfoAfter.txt
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
UninstallDisplaySize=115000
AppCopyright={#MyAppCopyright}
CreateAppDir=yes
DisableDirPage=no
DisableProgramGroupPage=no
DisableReadyMemo=no
DisableReadyPage=no
DisableFinishedPage=no
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousLanguage=yes
UsePreviousTasks=yes
RestartIfNeededByRun=false
ShowLanguageDialog=auto
LanguageDetectionMethod=locale
PrivilegesRequired=lowest
SignedUninstaller=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el Escritorio"; GroupDescription: "Iconos adicionales"
Name: "startmenuicon"; Description: "Crear acceso directo en el Menú Inicio"; GroupDescription: "Iconos adicionales"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Permissions: users-modify

; ============================================================================
; Iconos
; ============================================================================
[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Lanza Hydra Launcher"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"; WorkingDir: "{app}"; Comment: "Desinstala Hydra Launcher"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Lanza Hydra Launcher"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartmenu}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Lanza Hydra Launcher"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: startmenuicon

[InstallDelete]
; Eliminar accesos directos obsoletos de versiones anteriores (nombres "(Anclado)"/"(Barra tareas)")
Type: files; Name: "{userstartmenu}\{#MyAppName} (Anclado).lnk"
Type: files; Name: "{userstartmenu}\{#MyAppName} (Barra tareas).lnk"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Ejecutar Hydra Launcher"; Flags: nowait postinstall skipifsilent; StatusMsg: "Ejecutando Hydra Launcher..."
; Refrescar la caché de iconos de Windows (solo si el binario existe en esa ruta)
Filename: "{sys}\ie4uinit.exe"; Parameters: "-show"; Flags: runhidden nowait; Check: IE4ExistsSys
Filename: "{win}\Sysnative\ie4uinit.exe"; Parameters: "-show"; Flags: runhidden nowait; Check: IE4ExistsNative

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{group}\*"
Type: files; Name: "{userdesktop}\{#MyAppName}.lnk"
Type: files; Name: "{userstartmenu}\{#MyAppName}*.lnk"

[UninstallRun]
; Limpieza opcional de datos de usuario (comentado por defecto para no borrar mundos/mods)
; Filename: "cmd.exe"; Parameters: "/c rmdir /s /q ""%LOCALAPPDATA%\Hydra Launcher"""; Flags: runhidden

[Registry]
; Entrada en Add/Remove Programs
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayName"; ValueData: "{#MyAppName}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayVersion"; ValueData: "{#MyAppVersion}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "Publisher"; ValueData: "{#MyAppPublisher}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "URLInfoAbout"; ValueData: "{#MyAppURL}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayIcon"; ValueData: "{app}\{#MyAppExeName}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: dword; ValueName: "NoModify"; ValueData: 1
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: dword; ValueName: "NoRepair"; ValueData: 1
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "UninstallString"; ValueData: """{uninstallexe}"""
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "QuietUninstallString"; ValueData: """{uninstallexe}"" /SILENT"

; Protocolo personalizado hydra:// (opcional)
; Root: HKCU; Subkey: "Software\Classes\hydra"; ValueType: string; ValueName: ""; ValueData: "URL:Hydra Launcher Protocol"
; Root: HKCU; Subkey: "Software\Classes\hydra"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
; Root: HKCU; Subkey: "Software\Classes\hydra\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"
; Root: HKCU; Subkey: "Software\Classes\hydra\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Code]
// ============================================================================
// Páginas personalizadas opcionales
// ============================================================================

procedure CurPageChanged(CurPageID: Integer);
begin
  // Personalizar páginas si se desea
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
end;

// ============================================================================
// Inicialización
// ============================================================================

procedure InitializeWizard();
begin
  // Configuración inicial del wizard
end;

procedure DeinitializeSetup();
begin
  // Limpieza final
end;

function InitializeSetup(): Boolean;
begin
  // Verificaciones pre-instalación
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
end;

function IE4ExistsSys(): Boolean;
begin
  Result := FileExists(ExpandConstant('{sys}\ie4uinit.exe'));
end;

function IE4ExistsNative(): Boolean;
begin
  Result := FileExists(ExpandConstant('{win}\Sysnative\ie4uinit.exe'));
end;

// procedure CurStepChanged(Step: Integer);
// begin
//   if Step = 1 then begin  // ssPostInstall = 1
//     // Acciones post-instalación
//   end;
// end;

// procedure CurUninstallStepChanged(CurUninstallStep: Integer);
// begin
//   // Pasos de desinstalación
// end;