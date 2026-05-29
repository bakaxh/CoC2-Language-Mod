#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$GamePath = "",
    [string]$LunaRoot = "",
    [int]$TcpPort = 2333,
    [string]$ConfigPath = "",
    [switch]$NoLunaConfig,
    [switch]$NoSaveConfig,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {
}

$AdapterFileName = "coc2-luna-adapter.js"
$AdapterSource = Join-Path $PSScriptRoot "adapter\$AdapterFileName"
$DefaultConfigPath = Join-Path $PSScriptRoot "adapter-config.json"
$ScriptTag = '<script defer="defer" src="./coc2-luna-adapter.js" data-luna-coc2-adapter="1"></script>'
$ScriptRegex = @'
(?is)<script\b(?=[^>]*\bsrc\s*=\s*["'](?:\./)?coc2-luna-adapter\.js["'])[^>]*>\s*</script>
'@.Trim()
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Step {
    param([string]$Message)
    Write-Host "[Fenoxo-Luna] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[完成] $Message" -ForegroundColor Green
}

function Write-Note {
    param([string]$Message)
    Write-Host "[提示] $Message" -ForegroundColor Yellow
}

function Read-TextFile {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile {
    param(
        [string]$Path,
        [string]$Text
    )
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Read-AdapterConfig {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    try {
        return (Read-TextFile $Path) | ConvertFrom-Json
    } catch {
        Write-Note "无法读取适配器配置，已忽略: $Path"
        return $null
    }
}

function Save-AdapterConfig {
    param(
        [string]$Path,
        [string]$ResolvedGamePath,
        [string]$ResolvedLunaRoot,
        [int]$ResolvedTcpPort
    )

    if ($NoSaveConfig) { return }

    $config = [ordered]@{
        gamePath = $ResolvedGamePath
        lunaRoot = $ResolvedLunaRoot
        tcpPort = $ResolvedTcpPort
    }
    $json = ($config | ConvertTo-Json -Depth 10) + "`r`n"
    Write-TextFile -Path $Path -Text $json
    Write-Ok "已保存适配器配置: $Path"
}

function Use-AdapterConfig {
    if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
        $script:ConfigPath = $DefaultConfigPath
    }

    $config = Read-AdapterConfig $ConfigPath
    if ($null -eq $config) { return }

    if ([string]::IsNullOrWhiteSpace($GamePath) -and $config.PSObject.Properties.Name -contains "gamePath") {
        $script:GamePath = [string]$config.gamePath
    }

    if ([string]::IsNullOrWhiteSpace($LunaRoot) -and $config.PSObject.Properties.Name -contains "lunaRoot") {
        $script:LunaRoot = [string]$config.lunaRoot
    }

    if (($TcpPort -eq 2333) -and $config.PSObject.Properties.Name -contains "tcpPort") {
        $port = 0
        if ([int]::TryParse([string]$config.tcpPort, [ref]$port) -and $port -gt 0) {
            $script:TcpPort = $port
        }
    }
}

function Test-GameRoot {
    param([string]$Path)
    return $null -ne (Get-GameInfo $Path)
}

function Get-GameInfo {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    $appDir = Join-Path $Path "resources\app"
    $indexPath = Join-Path $appDir "index.html"
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) { return $null }

    $packagePath = Join-Path $appDir "package.json"
    $packageName = ""
    $productName = ""
    if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
        try {
            $package = (Read-TextFile $packagePath) | ConvertFrom-Json
            $packageName = [string]$package.name
            if ($package.PSObject.Properties.Name -contains "buildKey") {
                $productName = [string]$package.buildKey.productName
            }
        } catch {
        }
    }

    $html = ""
    try { $html = Read-TextFile $indexPath } catch { }
    $exeNames = @()
    Get-ChildItem -LiteralPath $Path -Filter "*.exe" -File -ErrorAction SilentlyContinue | ForEach-Object {
        $exeNames += $_.Name
    }

    $probe = (($Path, $packageName, $productName, $html, ($exeNames -join " ")) -join "`n")
    if ($probe -match "(?i)trials in tainted space|tits\.exe|com\.fenoxo\.tits|\btits\b") {
        return [pscustomobject]@{
            Key = "TiTS"
            Name = "Trials in Tainted Space"
            ShortName = "TiTS"
            ExeName = "TiTS.exe"
        }
    }
    if ($probe -match "(?i)coc2|corruption of champions ii|CoC II\.exe") {
        return [pscustomobject]@{
            Key = "CoC2"
            Name = "Corruption of Champions II"
            ShortName = "CoC2"
            ExeName = "CoC II.exe"
        }
    }

    return $null
}

function Get-LunaSavedGamePaths {
    param([string]$Root)

    if ([string]::IsNullOrWhiteSpace($Root)) { return @() }
    $userConfig = Join-Path $Root "userconfig"
    if (-not (Test-Path -LiteralPath $userConfig -PathType Container)) { return @() }

    $paths = New-Object "System.Collections.Generic.List[string]"
    Get-ChildItem -LiteralPath $userConfig -Filter "savegamedata_*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $data = (Read-TextFile $_.FullName) | ConvertFrom-Json
            if ($data.Count -lt 2) { return }
            $games = $data[1]
            foreach ($property in $games.PSObject.Properties) {
                $gamePathValue = $property.Value.gamepath
                if (-not [string]::IsNullOrWhiteSpace($gamePathValue)) {
                    $paths.Add([string]$gamePathValue) | Out-Null
                }
            }
        } catch {
        }
    }
    return $paths
}

function ConvertTo-GameRoot {
    param([string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
    $item = Get-Item -LiteralPath $resolved -ErrorAction Stop

    if (-not $item.PSIsContainer) {
        if ($item.Name -ieq "index.html" -and $item.Directory.Name -ieq "app") {
            return $item.Directory.Parent.Parent.FullName
        }
        return $item.DirectoryName
    }

    if (Test-GameRoot $item.FullName) { return $item.FullName }

    if ($item.Name -ieq "app" -and (Test-Path -LiteralPath (Join-Path $item.FullName "index.html") -PathType Leaf)) {
        return $item.Parent.Parent.FullName
    }

    if ($item.Name -ieq "resources" -and (Test-Path -LiteralPath (Join-Path $item.FullName "app\index.html") -PathType Leaf)) {
        return $item.Parent.FullName
    }

    throw "无法把这个路径识别为支持的 Fenoxo 游戏目录: $Path"
}

function Get-UniqueExistingDirs {
    param([string[]]$Paths)

    $seen = @{}
    foreach ($path in $Paths) {
        if ([string]::IsNullOrWhiteSpace($path)) { continue }
        if (-not (Test-Path -LiteralPath $path -PathType Container)) { continue }
        $full = (Resolve-Path -LiteralPath $path).ProviderPath
        $key = $full.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $full
        }
    }
}

function Get-CandidateDirs {
    param(
        [string]$Root,
        [int]$MaxDepth = 3
    )

    $queue = New-Object System.Collections.Queue
    $queue.Enqueue([pscustomobject]@{ Path = $Root; Depth = 0 })
    while ($queue.Count -gt 0) {
        $item = $queue.Dequeue()
        $item.Path
        if ($item.Depth -ge $MaxDepth) { continue }

        Get-ChildItem -LiteralPath $item.Path -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $queue.Enqueue([pscustomobject]@{ Path = $_.FullName; Depth = $item.Depth + 1 })
        }
    }
}

function Find-GameRoot {
    if (-not [string]::IsNullOrWhiteSpace($GamePath)) {
        $root = ConvertTo-GameRoot $GamePath
        if (Test-GameRoot $root) { return $root }
        throw "解析出的目录不像支持的 CoC2/TiTS Electron 游戏目录: $root"
    }

    $lunaForDetection = $null
    try {
        $lunaForDetection = Find-LunaRoot
    } catch {
        $lunaForDetection = $null
    }

    $roots = Get-UniqueExistingDirs @(
        $PSScriptRoot,
        (Split-Path -Parent $PSScriptRoot),
        (Get-Location).Path,
        $LunaRoot,
        $lunaForDetection,
        (Join-Path $env:USERPROFILE "Desktop"),
        (Join-Path $env:USERPROFILE "Downloads"),
        (Join-Path $env:USERPROFILE "Documents")
    )

    foreach ($root in $roots) {
        foreach ($dir in Get-CandidateDirs -Root $root -MaxDepth 3) {
            if (Test-GameRoot $dir) { return $dir }
        }
    }

    foreach ($savedPath in Get-LunaSavedGamePaths $lunaForDetection) {
        try {
            $root = ConvertTo-GameRoot $savedPath
            if (Test-GameRoot $root) { return $root }
        } catch {
        }
    }

    throw "没有自动找到支持的游戏。请使用 -GamePath 指定 CoC II.exe、TiTS.exe 或游戏目录。"
}

function Test-LunaRoot {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Path "userconfig\config.json") -PathType Leaf)
}

function Find-LunaRoot {
    if (-not [string]::IsNullOrWhiteSpace($LunaRoot)) {
        $root = (Resolve-Path -LiteralPath $LunaRoot -ErrorAction Stop).ProviderPath
        if (Test-LunaRoot $root) { return $root }
        throw "指定的 LunaRoot 中没有 userconfig\config.json: $LunaRoot"
    }

    $roots = Get-UniqueExistingDirs @(
        $PSScriptRoot,
        (Split-Path -Parent $PSScriptRoot),
        (Get-Location).Path
    )

    foreach ($root in $roots) {
        foreach ($dir in Get-CandidateDirs -Root $root -MaxDepth 2) {
            if (Test-LunaRoot $dir) { return $dir }
        }
    }

    return $null
}

function New-BackupDir {
    param([string]$BaseDir)

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $BaseDir ".luna-fenoxo-backups\$stamp"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    return $backupDir
}

function Backup-File {
    param(
        [string]$Path,
        [string]$BackupDir
    )

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupDir (Split-Path -Leaf $Path)) -Force
    }
}

function Install-GameAdapter {
    param([string]$GameRoot)

    if (-not (Test-Path -LiteralPath $AdapterSource -PathType Leaf)) {
        throw "缺少适配脚本文件: $AdapterSource"
    }

    $appDir = Join-Path $GameRoot "resources\app"
    $indexPath = Join-Path $appDir "index.html"
    $targetAdapter = Join-Path $appDir $AdapterFileName
    $backupDir = New-BackupDir $GameRoot

    Backup-File -Path $indexPath -BackupDir $backupDir
    Backup-File -Path $targetAdapter -BackupDir $backupDir

    Copy-Item -LiteralPath $AdapterSource -Destination $targetAdapter -Force

    $html = Read-TextFile $indexPath
    if ($html -notmatch $ScriptRegex) {
        if ($html -match '(?i)</head>') {
            $html = [regex]::Replace($html, '(?i)</head>', "$ScriptTag</head>")
        } else {
            $html = $html + "`r`n" + $ScriptTag
        }
        Write-TextFile -Path $indexPath -Text $html
        Write-Ok "已把适配器入口注入 index.html。"
    } else {
        Write-Ok "index.html 已包含适配器入口，已跳过重复注入。"
    }

    Write-Ok "已安装 $AdapterFileName。"
    Write-Note "备份目录: $backupDir"
}

function Uninstall-GameAdapter {
    param([string]$GameRoot)

    $appDir = Join-Path $GameRoot "resources\app"
    $indexPath = Join-Path $appDir "index.html"
    $targetAdapter = Join-Path $appDir $AdapterFileName
    $backupDir = New-BackupDir $GameRoot

    Backup-File -Path $indexPath -BackupDir $backupDir
    Backup-File -Path $targetAdapter -BackupDir $backupDir

    if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
        $html = Read-TextFile $indexPath
        $newHtml = [regex]::Replace($html, $ScriptRegex, "")
        if ($newHtml -ne $html) {
            Write-TextFile -Path $indexPath -Text $newHtml
            Write-Ok "已从 index.html 移除适配器入口。"
        }
    }

    if (Test-Path -LiteralPath $targetAdapter -PathType Leaf) {
        Remove-Item -LiteralPath $targetAdapter -Force
        Write-Ok "已删除 $AdapterFileName。"
    }

    Write-Note "卸载前备份目录: $backupDir"
}

function Set-JsonProperty {
    param(
        [object]$Object,
        [string]$Name,
        [object]$Value
    )

    if ($Object.PSObject.Properties.Name -contains $Name) {
        if ($Object.$Name -ne $Value) {
            $Object.$Name = $Value
            return $true
        }
        return $false
    }

    Add-Member -InputObject $Object -MemberType NoteProperty -Name $Name -Value $Value
    return $true
}

function Configure-Luna {
    param([string]$Root)

    if ([string]::IsNullOrWhiteSpace($Root)) {
        Write-Note "没有找到 LunaTranslator 根目录，已跳过本地 API 配置。可用 -LunaRoot 手动指定。"
        return
    }

    $running = Get-Process -Name "LunaTranslator", "LunaTranslator_admin" -ErrorAction SilentlyContinue
    if ($running) {
        Write-Note "LunaTranslator 正在运行。如果 Luna 退出时覆盖配置，请关闭 Luna 后重新运行本安装器。"
    }

    $configPath = Join-Path $Root "userconfig\config.json"
    $json = Read-TextFile $configPath
    $config = $json | ConvertFrom-Json

    $changed = $false
    $changed = (Set-JsonProperty -Object $config -Name "networktcpenable" -Value $true) -or $changed
    $changed = (Set-JsonProperty -Object $config -Name "networktcpport" -Value $TcpPort) -or $changed

    if (-not $changed) {
        Write-Ok "Luna 本地 API 已在端口 $TcpPort 启用。"
        return
    }

    $backupDir = New-BackupDir $Root
    Backup-File -Path $configPath -BackupDir $backupDir
    $newJson = $config | ConvertTo-Json -Depth 100
    Write-TextFile -Path $configPath -Text ($newJson + "`r`n")
    Write-Ok "已启用 Luna 本地 API，端口 $TcpPort。"
    Write-Note "Luna 配置备份目录: $backupDir"
}

try {
    Use-AdapterConfig
    Write-Step "正在配置 Fenoxo Luna 适配器。"
    $gameRoot = Find-GameRoot
    $gameInfo = Get-GameInfo $gameRoot
    Write-Ok "$($gameInfo.ShortName) 目录: $gameRoot"

    if ($Uninstall) {
        Uninstall-GameAdapter -GameRoot $gameRoot
        Save-AdapterConfig -Path $ConfigPath -ResolvedGamePath $gameRoot -ResolvedLunaRoot $LunaRoot -ResolvedTcpPort $TcpPort
        Write-Ok "卸载完成。"
        exit 0
    }

    Install-GameAdapter -GameRoot $gameRoot

    if (-not $NoLunaConfig) {
        $luna = Find-LunaRoot
        Configure-Luna -Root $luna
    } else {
        $luna = $LunaRoot
    }

    Save-AdapterConfig -Path $ConfigPath -ResolvedGamePath $gameRoot -ResolvedLunaRoot $luna -ResolvedTcpPort $TcpPort

    Write-Ok "安装完成。请先启动 LunaTranslator，再启动游戏以使用内嵌翻译。"
    exit 0
} catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
