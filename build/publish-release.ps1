# Hydra Launcher - Publicar release en GitHub
# Uso: .\publish-release.ps1 -Version "1.0.0" -Token "ghp_xxx"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$true)]
    [string]$Token,
    
    [string]$Repo = "scainetprr/hydra-launcher-web",
    [string]$InstallerPath = "E:\Launcher\release\Hydra-Launcher-Setup-v$Version.exe",
    [string]$PortablePath = "E:\Launcher\release\Hydra-Launcher-Portable-v$Version.zip"
)

Write-Host "=== Hydra Launcher Release Publisher ===" -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "Repo: $Repo"
Write-Host "Installer: $InstallerPath"
Write-Host "Portable: $PortablePath"

# Verificar archivos
if (-not (Test-Path $InstallerPath)) {
    Write-Error "Instalador no encontrado: $InstallerPath"
    exit 1
}
if (-not (Test-Path $PortablePath)) {
    Write-Error "Portable no encontrado: $PortablePath"
    exit 1
}

$installerSize = (Get-Item $InstallerPath).Length
$portableSize = (Get-Item $PortablePath).Length
Write-Host "Instalador: $([math]::Round($installerSize/1MB, 1)) MB"
Write-Host "Portable: $([math]::Round($portableSize/1MB, 1)) MB"

# Headers para GitHub API
$headers = @{
    "Authorization" = "token $Token"
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "Hydra-Launcher-Publisher"
}

$apiBase = "https://api.github.com/repos/$Repo"

# 1. Crear el release
Write-Host "`n[1/4] Creando release en GitHub..." -ForegroundColor Yellow
$releaseBody = @"
## Hydra Launcher v$Version

### 🚀 Novedades
- Auto-updater nativo via GitHub Releases
- Modpacks: crear/gestionar/aplicar packs de mods
- Escaneo recursivo de mods en subcarpetas
- Instalador profesional con Inno Setup
- Icono personalizado Hydra

### 📥 Descargas
- **Instalador** (recomendado): `Hydra-Launcher-Setup-v$Version.exe` (~75 MB)
- **Portable**: `Hydra-Launcher-Portable-v$Version.zip` (~112 MB)

### 🔧 Auto-actualización
El launcher se actualiza solo al abrirse. Si hay versión nueva, la descarga en segundo plano y se instala al cerrar.

---
*Compilado: $(Get-Date -Format 'yyyy-MM-dd HH:mm')*
"@

$releaseData = @{
    tag_name = "v$Version"
    name = "Hydra Launcher v$Version"
    body = $releaseBody
    draft = $false
    prerelease = $false
} | ConvertTo-Json -Depth 3

try {
    $releaseResponse = Invoke-RestMethod -Method Post -Uri "$apiBase/releases" -Headers $headers -Body $releaseData -ContentType "application/json"
    $releaseId = $releaseResponse.id
    $uploadUrl = $releaseResponse.upload_url -replace '\{.*$', ''
    Write-Host "✅ Release creado: $($releaseResponse.html_url)" -ForegroundColor Green
} catch {
    Write-Error "Error creando release: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Error $reader.ReadToEnd()
    }
    exit 1
}

# 2. Subir instalador
Write-Host "`n[2/4] Subiendo instalador..." -ForegroundColor Yellow
$installerFileName = "Hydra-Launcher-Setup-v$Version.exe"
try {
    $uploadHeaders = $headers + @{ "Content-Type" = "application/octet-stream" }
    Invoke-RestMethod -Method Post -Uri "$uploadUrl?name=$installerFileName" -Headers $uploadHeaders -InFile $InstallerPath -ContentType "application/octet-stream" -Method Post
    Write-Host "✅ Instalador subido ($([math]::Round($installerSize/1MB, 1)) MB)" -ForegroundColor Green
} catch {
    Write-Error "Error subiendo instalador: $($_.Exception.Message)"
    exit 1
}

# 3. Subir portable
Write-Host "`n[3/4] Subiendo portable..." -ForegroundColor Yellow
$portableFileName = "Hydra-Launcher-Portable-v$Version.zip"
try {
    Invoke-RestMethod -Method Post -Uri "$uploadUrl?name=$portableFileName" -Headers $uploadHeaders -InFile $PortablePath -ContentType "application/zip" -Method Post
    Write-Host "✅ Portable subido ($([math]::Round($portableSize/1MB, 1)) MB)" -ForegroundColor Green
} catch {
    Write-Error "Error subiendo portable: $($_.Exception.Message)"
    exit 1
}

# 4. Generar latest.yml para auto-updater
Write-Host "`n[4/4] Generando latest.yml..." -ForegroundColor Yellow
$latestYml = @"
version: $Version
files:
  - url: Hydra-Launcher-Setup-v$Version.exe
    sha512: $(Get-FileHash -Algorithm SHA512 $InstallerPath | Select-Object -ExpandProperty Hash).ToLower()
    size: $installerSize
  - url: Hydra-Launcher-Portable-v$Version.zip
    sha512: $(Get-FileHash -Algorithm SHA512 $PortablePath | Select-Object -ExpandProperty Hash).ToLower()
    size: $portableSize
path: Hydra-Launcher-Setup-v$Version.exe
sha512: $(Get-FileHash -Algorithm SHA512 $InstallerPath | Select-Object -ExpandProperty Hash).ToLower()
releaseDate: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'))
"@

$latestYmlPath = "E:\Launcher\release\latest.yml"
$latestYml | Out-File -FilePath $latestYmlPath -Encoding utf8

# Subir latest.yml
Write-Host "Subiendo latest.yml..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method Post -Uri "$uploadUrl?name=latest.yml" -Headers $uploadHeaders -InFile $latestYmlPath -ContentType "application/octet-stream" -Method Post
    Write-Host "✅ latest.yml subido" -ForegroundColor Green
} catch {
    Write-Error "Error subiendo latest.yml: $($_.Exception.Message)"
    exit 1
}

Write-Host "`n🎉 ¡Release v$Version publicado exitosamente!" -ForegroundColor Cyan
Write-Host "URL: https://github.com/scainetprr/hydra-launcher-web/releases/tag/v$Version" -ForegroundColor Cyan