; ============================================================================
; Hydra Launcher - Inno Setup Script (Dark Theme estilo TLauncher)
; Genera instalador .exe con panel oscuro, imagen lateral y botón verde
; Compilar con: iscc "E:\Launcher\build\HydraLauncher.iss"
; ============================================================================

#define MyAppName "Hydra Launcher"
#define MyAppVersion "1.3.12"
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
; ocultar el "info after" para un final más limpio
; (se eliminó InfoAfterFile)

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
spanish.WelcomeLabel1=¡Bienvenido a la instalación de [name]!
spanish.WelcomeLabel2=Este asistente te guiará en la instalación de Hydra Launcher en tu equipo.%n%nSe recomienda cerrar otros programas antes de continuar.%n%nHaz clic en Continuar para empezar.
spanish.LicenseLabel=Acuerdo de Licencia
spanish.LicenseLabel3=Por favor, lee el siguiente acuerdo de licencia antes de continuar. Debes aceptar las cláusulas para instalar Hydra Launcher.
spanish.SelectTasksLabel2=Marca las tareas adicionales que desees realizar durante la instalación:
spanish.InstallingLabel=Instalando [name] en tu equipo. Esto puede tardar unos segundos...
spanish.FinishedLabel=¡La instalación de [name] en tu equipo ha finalizado!
spanish.ButtonNext=&Continuar
spanish.ButtonBack=&Volver
spanish.ButtonInstall=&Instalar
spanish.ButtonFinish=&Finalizar
spanish.ButtonCancel=&Cancelar

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
// Tema oscuro personalizado para el instalador (Hydra)
// Clave: cada control de texto recibe fondo EXPLÍCITO (ParentBackground:=False + Color)
// si no, el texto blanco hereda fondo claro y desaparece.

const
  CLR_BG      = $2E2E2E;  // fondo general (gris oscuro)
  CLR_PANEL   = $262626;  // memos, listas, edits
  CLR_TEXT    = $FFFFFF;
  CLR_TEXT_DIM= $C8C8C8;
  CLR_GREEN   = $32C845;  // acento

procedure DarkenChildren(Parent: TWinControl; TextColor: Integer);
var
  I: Integer;
  C: TControl;
begin
  for I := 0 to Parent.ControlCount - 1 do
  begin
    C := Parent.Controls[I];
    if C is TNewStaticText then
    begin
      TNewStaticText(C).ParentBackground := False;
      TNewStaticText(C).Color := CLR_BG;
      TNewStaticText(C).Font.Color := TextColor;
    end
    else if C is TMemo then
    begin
      TMemo(C).ParentBackground := False;
      TMemo(C).Color := CLR_PANEL;
      TMemo(C).Font.Color := CLR_TEXT;
    end
    else if C is TEdit then
    begin
      TEdit(C).ParentBackground := False;
      TEdit(C).Color := CLR_PANEL;
      TEdit(C).Font.Color := CLR_TEXT;
    end
    else if C is TNewCheckListBox then
    begin
      TNewCheckListBox(C).ParentBackground := False;
      TNewCheckListBox(C).Color := CLR_PANEL;
      TNewCheckListBox(C).Font.Color := CLR_TEXT;
    end
    else if C is TListBox then
    begin
      TListBox(C).ParentBackground := False;
      TListBox(C).Color := CLR_PANEL;
      TListBox(C).Font.Color := CLR_TEXT;
    end
    else if C is TNewCheckBox then
      TNewCheckBox(C).Font.Color := TextColor
    else if C is TNewRadioButton then
      TNewRadioButton(C).Font.Color := TextColor
    else if C is TNewNotebookPage then
    begin
      TNewNotebookPage(C).ParentBackground := False;
      TNewNotebookPage(C).Color := CLR_BG;
      DarkenChildren(TWinControl(C), TextColor);
    end
    else if C is TNewNotebook then
      DarkenChildren(TWinControl(C), TextColor) // notebooks no exponen Color
    else if C is TWinControl then
      DarkenChildren(TWinControl(C), TextColor); // contenedores: sin cambiar color
  end;
end;

procedure StyleButton(Btn: TNewButton; Bold: Boolean);
begin
  Btn.Font.Color := CLR_TEXT;
  Btn.Font.Size := 9;
  if Bold then
    Btn.Font.Style := [fsBold]
  else
    Btn.Font.Style := [];
end;

procedure InitializeWizard();
begin
  WizardForm.Color := CLR_BG;
  WizardForm.Font.Color := CLR_TEXT;
  WizardForm.Font.Size := 9;

  DarkenChildren(WizardForm, CLR_TEXT);

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
  WizardForm.LicenseMemo.Font.Size := 9;

  WizardForm.DirEdit.Font.Size := 9;
  WizardForm.GroupEdit.Font.Size := 9;

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
