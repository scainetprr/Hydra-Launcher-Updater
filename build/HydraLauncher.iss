; ============================================================================
; Hydra Launcher - Inno Setup Script (Dark Theme estilo TLauncher)
; Genera instalador .exe con panel oscuro, imagen lateral y botón verde
; Compilar con: iscc "E:\Launcher\build\HydraLauncher.iss"
; ============================================================================

#define MyAppName "Hydra Launcher"
#define MyAppVersion "1.3.10"
#define MyAppPublisher "Hydra Studio (scainetprr)"
#define MyAppURL "https://discord.gg/qyyREajJgC"
#define MyAppExeName "Hydra Launcher.exe"
#define MyAppCopyright "Copyright © 2026 Dylan David Gomez"

#define SourceDir "E:\Launcher\release\win-unpacked"
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
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
UninstallDisplaySize=115000
AppCopyright={#MyAppCopyright}
CreateAppDir=yes
DisableDirPage=no
DisableProgramGroupPage=yes
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
; panel lateral oscuro + imagen pequeña
WizardImageFile=wizard\WizardImage.bmp
WizardSmallImageFile=wizard\WizardSmallImage.bmp
; título de barra
WindowShowCaption=yes
WindowStartMaximized=no
WindowResizable=no
; ocultar el "info after" para un final más limpio
; (se eliminó InfoAfterFile)

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
spanish.WelcomeLabel1=¡Bienvenido a la instalación de [name]!
spanish.WelcomeLabel2=Este asistente te guiará en la instalación de Hydra Launcher en tu equipo.%n%nSe recomienda cerrar otros programas antes de continuar.%n%nHaz clic en Continuar para empezar.
spanish.LicenseLabel=Acuerdo de Licencia
spanish.LicenseLabel3=Por favor, lee el siguiente acuerdo de licencia antes de continuar. Debes aceptar las cláusulas para instalar Hydra Launcher.
spanish.LicenseMemoLabel=
spanish.DirLabel=Destino de instalación
spanish.DirLabel3=Elige la carpeta donde quieres instalar Hydra Launcher.%n%nPara instalar en la ruta predeterminada, haz clic en Continuar.
spanish.DirBrowseLabel=Para elegir otra carpeta, haz clic en Examinar.
spanish.GroupLabel=Nombre del grupo del menú inicio
spanish.GroupLabel3=Elige el nombre de la carpeta del menú inicio donde se crearán los accesos directos del programa.
spanish.GroupBrowseLabel=Para elegir otra carpeta, haz clic en Examinar.
spanish.SelectTasksLabel=Tareas adicionales
spanish.SelectTasksLabel2=Marca las tareas adicionales que desees realizar durante la instalación:
spanish.SelectTasksDescLabel=¿Qué tareas adicionales deseas realizar?
spanish.ReadyLabel=Listo para instalar
spanish.ReadyLabel3=El instalador está preparado para comenzar la instalación de [name].%n%nHaz clic en Instalar para continuar con la instalación, o vuelve atrás si deseas revisar alguna opción.
spanish.ReadyMemoLabel=Estas son las opciones que elegiste:
spanish.InstallingLabel=Instalando [name] en tu equipo. Esto puede tardar unos segundos...
spanish.FinishedLabel=¡La instalación de [name] en tu equipo ha finalizado!
spanish.FinishedLabel2=Hydra Launcher está listo para usar.%n%nHaz clic en Finalizar para cerrar el asistente.
spanish.ButtonNext=&Continuar
spanish.ButtonBack=&Volver
spanish.ButtonInstall=&Instalar
spanish.ButtonFinish=&Finalizar
spanish.ButtonCancel=&Cancelar
spanish.PasswordLabel=Introduce la contraseña de administrador

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Iconos adicionales:"; Flags: unchecked
Name: "startmenuicon"; Description: "Crear un acceso directo en el Menú Inicio"; GroupDescription: "Iconos adicionales:"; Flags: checkedonce
Name: "runafter"; Description: "Ejecutar Hydra Launcher al finalizar la instalación"; GroupDescription: "Tareas adicionales:"; Flags: checkedonce

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Lanza Hydra Launcher"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"; WorkingDir: "{app}"; Comment: "Desinstala Hydra Launcher"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Lanza Hydra Launcher"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartmenu}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Lanza Hydra Launcher"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: startmenuicon

[InstallDelete]
Type: files; Name: "{userstartmenu}\{#MyAppName} (Anclado).lnk"
Type: files; Name: "{userstartmenu}\{#MyAppName} (Barra tareas).lnk"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Ejecutar Hydra Launcher"; Flags: nowait postinstall skipifsilent; Tasks: runafter; StatusMsg: "Ejecutando Hydra Launcher..."
Filename: "{sys}\ie4uinit.exe"; Parameters: "-show"; Flags: runhidden nowait; Check: IE4ExistsSys
Filename: "{win}\Sysnative\ie4uinit.exe"; Parameters: "-show"; Flags: runhidden nowait; Check: IE4ExistsNative

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{group}\*"
Type: files; Name: "{userdesktop}\{#MyAppName}.lnk"
Type: files; Name: "{userstartmenu}\{#MyAppName}*.lnk"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayName"; ValueData: "{#MyAppName}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayVersion"; ValueData: "{#MyAppVersion}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "Publisher"; ValueData: "{#MyAppPublisher}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "URLInfoAbout"; ValueData: "{#MyAppURL}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayIcon"; ValueData: "{app}\{#MyAppExeName}"
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: dword; ValueName: "NoModify"; ValueData: 1
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: dword; ValueName: "NoRepair"; ValueData: 1
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "UninstallString"; ValueData: """{uninstallexe}"""
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "QuietUninstallString"; ValueData: """{uninstallexe}"" /SILENT"

[Code]
[Code]
// Tema oscuro personalizado para el instalador

const
  CLR_TEXT     = $FFFFFF;
  CLR_TEXT_DIM = $B0B8C0;
  CLR_GREEN    = $45C832;
  CLR_PANEL    = $3D3225;

procedure StyleButton(Btn: TNewButton; Bold: Boolean);
begin
  Btn.Font.Color := CLR_TEXT;
  Btn.Font.Size := 10;
  if Bold then
    Btn.Font.Style := [fsBold]
  else
    Btn.Font.Style := [];
  Btn.Width := 110;
  Btn.Height := 28;
end;

procedure InitializeWizard();
begin
  WizardForm.Font.Color := CLR_TEXT;
  WizardForm.Font.Size := 9;

  StyleButton(WizardForm.CancelButton, False);
  StyleButton(WizardForm.BackButton, False);
  StyleButton(WizardForm.NextButton, True);
  WizardForm.NextButton.Font.Color := CLR_GREEN;

  WizardForm.WelcomeLabel1.Font.Color := CLR_GREEN;
  WizardForm.WelcomeLabel1.Font.Size := 14;
  WizardForm.WelcomeLabel1.Font.Style := [fsBold];
  WizardForm.WelcomeLabel2.Font.Color := CLR_TEXT_DIM;

  WizardForm.LicenseLabel1.Font.Color := CLR_GREEN;
  WizardForm.LicenseLabel1.Font.Size := 12;
  WizardForm.LicenseLabel1.Font.Style := [fsBold];
  WizardForm.LicenseMemo.Color := CLR_PANEL;
  WizardForm.LicenseMemo.Font.Color := CLR_TEXT;
  WizardForm.LicenseMemo.Font.Size := 9;

  WizardForm.DirEdit.Color := CLR_PANEL;
  WizardForm.DirEdit.Font.Color := CLR_TEXT;

  WizardForm.GroupEdit.Color := CLR_PANEL;
  WizardForm.GroupEdit.Font.Color := CLR_TEXT;

  WizardForm.TasksList.Color := CLR_PANEL;
  WizardForm.TasksList.Font.Color := CLR_TEXT;

  WizardForm.ReadyMemo.Color := CLR_PANEL;
  WizardForm.ReadyMemo.Font.Color := CLR_TEXT;

  WizardForm.FinishedLabel.Font.Color := CLR_GREEN;
  WizardForm.FinishedLabel.Font.Size := 14;
  WizardForm.FinishedLabel.Font.Style := [fsBold];
end;

function InitializeSetup(): Boolean;
begin
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
