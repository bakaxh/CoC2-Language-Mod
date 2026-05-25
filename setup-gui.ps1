#requires -Version 5.1
param(
    [switch]$DetectOnly
)

$ErrorActionPreference = "Stop"

$ScriptRoot = $PSScriptRoot
$InstallerPath = Join-Path $ScriptRoot "install.ps1"
$ConfigPath = Join-Path $ScriptRoot "adapter-config.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

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
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        return [pscustomobject]@{
            gamePath = ""
            lunaRoot = ""
            tcpPort = 2333
        }
    }

    try {
        $config = (Read-TextFile $ConfigPath) | ConvertFrom-Json
        if (-not ($config.PSObject.Properties.Name -contains "gamePath")) {
            Add-Member -InputObject $config -MemberType NoteProperty -Name "gamePath" -Value ""
        }
        if (-not ($config.PSObject.Properties.Name -contains "lunaRoot")) {
            Add-Member -InputObject $config -MemberType NoteProperty -Name "lunaRoot" -Value ""
        }
        if (-not ($config.PSObject.Properties.Name -contains "tcpPort")) {
            Add-Member -InputObject $config -MemberType NoteProperty -Name "tcpPort" -Value 2333
        }
        return $config
    } catch {
        return [pscustomobject]@{
            gamePath = ""
            lunaRoot = ""
            tcpPort = 2333
        }
    }
}

function Save-AdapterConfig {
    param(
        [string]$GamePath,
        [string]$LunaRoot,
        [int]$TcpPort
    )

    $config = [ordered]@{
        gamePath = $GamePath
        lunaRoot = $LunaRoot
        tcpPort = $TcpPort
    }
    Write-TextFile -Path $ConfigPath -Text (($config | ConvertTo-Json -Depth 10) + "`r`n")
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

function Resolve-GameRoot {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return "" }
    $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
    if ($null -eq $item) { return "" }

    if (-not $item.PSIsContainer) {
        if ($item.Name -ieq "index.html" -and $item.Directory.Name -ieq "app") {
            return $item.Directory.Parent.Parent.FullName
        }
        if ($item.Name -ieq "CoC II.exe" -or $item.Name -ieq "TiTS.exe") {
            return $item.DirectoryName
        }
        return ""
    }

    if (Test-GameRoot $item.FullName) { return $item.FullName }
    if ($item.Name -ieq "app" -and (Test-Path -LiteralPath (Join-Path $item.FullName "index.html") -PathType Leaf)) {
        return $item.Parent.Parent.FullName
    }
    if ($item.Name -ieq "resources" -and (Test-Path -LiteralPath (Join-Path $item.FullName "app\index.html") -PathType Leaf)) {
        return $item.Parent.FullName
    }

    return ""
}

function Test-LunaRoot {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Path "userconfig\config.json") -PathType Leaf)
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

function Add-UniquePath {
    param(
        [System.Collections.Generic.List[string]]$List,
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return }
    $full = (Resolve-Path -LiteralPath $Path).ProviderPath
    foreach ($existing in $List) {
        if ($existing -ieq $full) { return }
    }
    $List.Add($full) | Out-Null
}

function Get-SearchRoots {
    param([object]$Config)

    $roots = New-Object "System.Collections.Generic.List[string]"
    Add-UniquePath $roots $ScriptRoot
    Add-UniquePath $roots (Split-Path -Parent $ScriptRoot)
    Add-UniquePath $roots (Get-Location).Path
    Add-UniquePath $roots (Resolve-GameRoot ([string]$Config.gamePath))
    Add-UniquePath $roots ([string]$Config.lunaRoot)
    Add-UniquePath $roots (Join-Path $env:USERPROFILE "Desktop")
    Add-UniquePath $roots (Join-Path $env:USERPROFILE "Downloads")
    Add-UniquePath $roots (Join-Path $env:USERPROFILE "Documents")
    return $roots
}

function Search-Directories {
    param(
        [string[]]$Roots,
        [int]$MaxDepth,
        [int]$MaxVisited = 3000
    )

    $visited = 0
    foreach ($root in $Roots) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }

        $queue = New-Object System.Collections.Queue
        $queue.Enqueue([pscustomobject]@{ Path = $root; Depth = 0 })
        while ($queue.Count -gt 0 -and $visited -lt $MaxVisited) {
            $item = $queue.Dequeue()
            $visited += 1
            $item.Path

            if ($item.Depth -ge $MaxDepth) { continue }
            Get-ChildItem -LiteralPath $item.Path -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $queue.Enqueue([pscustomobject]@{ Path = $_.FullName; Depth = $item.Depth + 1 })
            }
        }
    }
}

function Find-GameRoot {
    param([object]$Config)

    $configured = Resolve-GameRoot ([string]$Config.gamePath)
    if (Test-GameRoot $configured) { return $configured }

    foreach ($dir in Search-Directories -Roots (Get-SearchRoots $Config) -MaxDepth 3) {
        if (Test-GameRoot $dir) { return $dir }
    }

    $luna = Find-LunaRoot $Config
    foreach ($savedPath in Get-LunaSavedGamePaths $luna) {
        $root = Resolve-GameRoot $savedPath
        if (Test-GameRoot $root) { return $root }
    }

    return ""
}

function Find-LunaRoot {
    param([object]$Config)

    if (Test-LunaRoot ([string]$Config.lunaRoot)) {
        return (Resolve-Path -LiteralPath ([string]$Config.lunaRoot)).ProviderPath
    }

    foreach ($dir in Search-Directories -Roots (Get-SearchRoots $Config) -MaxDepth 2) {
        if (Test-LunaRoot $dir) { return $dir }
    }

    return ""
}

function Quote-Arg {
    param([string]$Value)
    return '"' + ($Value -replace '"', '\"') + '"'
}

function Invoke-Installer {
    param(
        [string]$GamePath,
        [string]$LunaRoot,
        [int]$TcpPort,
        [bool]$ConfigureLuna,
        [bool]$Uninstall
    )

    $args = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        (Quote-Arg $InstallerPath),
        "-ConfigPath",
        (Quote-Arg $ConfigPath),
        "-TcpPort",
        $TcpPort
    )

    if (-not [string]::IsNullOrWhiteSpace($GamePath)) {
        $args += @("-GamePath", (Quote-Arg $GamePath))
    }
    if (-not [string]::IsNullOrWhiteSpace($LunaRoot)) {
        $args += @("-LunaRoot", (Quote-Arg $LunaRoot))
    }
    if (-not $ConfigureLuna) {
        $args += "-NoLunaConfig"
    }
    if ($Uninstall) {
        $args += "-Uninstall"
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = ($args -join " ")
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Output = ($stdout + $stderr)
    }
}

$config = Read-AdapterConfig

if ($DetectOnly) {
    $game = Find-GameRoot $config
    $luna = Find-LunaRoot $config
    $port = 2333
    [int]::TryParse([string]$config.tcpPort, [ref]$port) | Out-Null
    ([ordered]@{
        gamePath = $game
        lunaRoot = $luna
        tcpPort = $port
    } | ConvertTo-Json -Depth 10)
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "CoC2 / TiTS Luna Adapter Setup"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(760, 520)
$form.MinimumSize = New-Object System.Drawing.Size(720, 480)

$font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$form.Font = $font

$labelGame = New-Object System.Windows.Forms.Label
$labelGame.Text = "Game path (CoC2/TiTS folder, CoC II.exe, or TiTS.exe)"
$labelGame.Location = New-Object System.Drawing.Point(16, 18)
$labelGame.Size = New-Object System.Drawing.Size(300, 22)
$form.Controls.Add($labelGame)

$textGame = New-Object System.Windows.Forms.TextBox
$textGame.Location = New-Object System.Drawing.Point(16, 42)
$textGame.Size = New-Object System.Drawing.Size(600, 25)
$textGame.Anchor = "Top,Left,Right"
$textGame.Text = [string]$config.gamePath
$form.Controls.Add($textGame)

$buttonGame = New-Object System.Windows.Forms.Button
$buttonGame.Text = "Browse..."
$buttonGame.Location = New-Object System.Drawing.Point(626, 40)
$buttonGame.Size = New-Object System.Drawing.Size(100, 28)
$buttonGame.Anchor = "Top,Right"
$form.Controls.Add($buttonGame)

$labelLuna = New-Object System.Windows.Forms.Label
$labelLuna.Text = "LunaTranslator folder"
$labelLuna.Location = New-Object System.Drawing.Point(16, 82)
$labelLuna.Size = New-Object System.Drawing.Size(300, 22)
$form.Controls.Add($labelLuna)

$textLuna = New-Object System.Windows.Forms.TextBox
$textLuna.Location = New-Object System.Drawing.Point(16, 106)
$textLuna.Size = New-Object System.Drawing.Size(600, 25)
$textLuna.Anchor = "Top,Left,Right"
$textLuna.Text = [string]$config.lunaRoot
$form.Controls.Add($textLuna)

$buttonLuna = New-Object System.Windows.Forms.Button
$buttonLuna.Text = "Browse..."
$buttonLuna.Location = New-Object System.Drawing.Point(626, 104)
$buttonLuna.Size = New-Object System.Drawing.Size(100, 28)
$buttonLuna.Anchor = "Top,Right"
$form.Controls.Add($buttonLuna)

$labelPort = New-Object System.Windows.Forms.Label
$labelPort.Text = "Luna local API port"
$labelPort.Location = New-Object System.Drawing.Point(16, 146)
$labelPort.Size = New-Object System.Drawing.Size(160, 22)
$form.Controls.Add($labelPort)

$numericPort = New-Object System.Windows.Forms.NumericUpDown
$numericPort.Location = New-Object System.Drawing.Point(176, 144)
$numericPort.Size = New-Object System.Drawing.Size(100, 25)
$numericPort.Minimum = 1
$numericPort.Maximum = 65535
$portValue = 2333
[int]::TryParse([string]$config.tcpPort, [ref]$portValue) | Out-Null
$numericPort.Value = $portValue
$form.Controls.Add($numericPort)

$checkLuna = New-Object System.Windows.Forms.CheckBox
$checkLuna.Text = "Configure Luna local API automatically"
$checkLuna.Location = New-Object System.Drawing.Point(306, 145)
$checkLuna.Size = New-Object System.Drawing.Size(300, 24)
$checkLuna.Checked = $true
$form.Controls.Add($checkLuna)

$buttonDetect = New-Object System.Windows.Forms.Button
$buttonDetect.Text = "Auto Detect"
$buttonDetect.Location = New-Object System.Drawing.Point(16, 188)
$buttonDetect.Size = New-Object System.Drawing.Size(115, 32)
$form.Controls.Add($buttonDetect)

$buttonSave = New-Object System.Windows.Forms.Button
$buttonSave.Text = "Save Config"
$buttonSave.Location = New-Object System.Drawing.Point(142, 188)
$buttonSave.Size = New-Object System.Drawing.Size(115, 32)
$form.Controls.Add($buttonSave)

$buttonInstall = New-Object System.Windows.Forms.Button
$buttonInstall.Text = "Install / Update"
$buttonInstall.Location = New-Object System.Drawing.Point(438, 188)
$buttonInstall.Size = New-Object System.Drawing.Size(135, 32)
$buttonInstall.Anchor = "Top,Right"
$form.Controls.Add($buttonInstall)

$buttonUninstall = New-Object System.Windows.Forms.Button
$buttonUninstall.Text = "Uninstall"
$buttonUninstall.Location = New-Object System.Drawing.Point(584, 188)
$buttonUninstall.Size = New-Object System.Drawing.Size(142, 32)
$buttonUninstall.Anchor = "Top,Right"
$form.Controls.Add($buttonUninstall)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(16, 238)
$logBox.Size = New-Object System.Drawing.Size(710, 220)
$logBox.Anchor = "Top,Left,Right,Bottom"
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$form.Controls.Add($logBox)

function Add-Log {
    param([string]$Text)
    $logBox.AppendText($Text.TrimEnd() + [Environment]::NewLine)
}

function Save-CurrentConfig {
    Save-AdapterConfig -GamePath $textGame.Text.Trim() -LunaRoot $textLuna.Text.Trim() -TcpPort ([int]$numericPort.Value)
    Add-Log "Config saved: $ConfigPath"
}

$buttonGame.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select CoC II.exe or TiTS.exe"
    $dialog.Filter = "Supported games|CoC II.exe;TiTS.exe|Executable files|*.exe|All files|*.*"
    if (-not [string]::IsNullOrWhiteSpace($textGame.Text) -and (Test-Path -LiteralPath $textGame.Text)) {
        $root = Resolve-GameRoot $textGame.Text
        if (-not [string]::IsNullOrWhiteSpace($root)) {
            $dialog.InitialDirectory = $root
        }
    }
    if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $textGame.Text = $dialog.FileName
    }
})

$buttonLuna.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Select LunaTranslator folder"
    if (-not [string]::IsNullOrWhiteSpace($textLuna.Text) -and (Test-Path -LiteralPath $textLuna.Text -PathType Container)) {
        $dialog.SelectedPath = $textLuna.Text
    }
    if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $textLuna.Text = $dialog.SelectedPath
    }
})

$buttonDetect.Add_Click({
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    try {
        Add-Log "Auto detecting paths..."
        $current = [pscustomobject]@{
            gamePath = $textGame.Text.Trim()
            lunaRoot = $textLuna.Text.Trim()
            tcpPort = [int]$numericPort.Value
        }
        $game = Find-GameRoot $current
        $luna = Find-LunaRoot $current
        if (-not [string]::IsNullOrWhiteSpace($game)) {
            $textGame.Text = $game
            $info = Get-GameInfo $game
            Add-Log "Found $($info.ShortName): $game"
        } else {
            Add-Log "No supported game was found. Click Browse and select CoC II.exe or TiTS.exe."
        }
        if (-not [string]::IsNullOrWhiteSpace($luna)) {
            $textLuna.Text = $luna
            Add-Log "Found LunaTranslator: $luna"
        } else {
            Add-Log "LunaTranslator was not found. Click Browse and select its folder."
        }
    } catch {
        Add-Log "Detect error: $($_.Exception.Message)"
    } finally {
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
    }
})

$buttonSave.Add_Click({
    try {
        Save-CurrentConfig
    } catch {
        [System.Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, "Save failed", "OK", "Error") | Out-Null
    }
})

function Run-Setup {
    param([bool]$Uninstall)

    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    $buttonInstall.Enabled = $false
    $buttonUninstall.Enabled = $false
    try {
        Save-CurrentConfig
        Add-Log ""
        if ($Uninstall) {
            Add-Log "Running uninstall..."
        } else {
            Add-Log "Running install/update..."
        }
        $result = Invoke-Installer -GamePath $textGame.Text.Trim() -LunaRoot $textLuna.Text.Trim() -TcpPort ([int]$numericPort.Value) -ConfigureLuna $checkLuna.Checked -Uninstall $Uninstall
        Add-Log $result.Output
        if ($result.ExitCode -eq 0) {
            [System.Windows.Forms.MessageBox]::Show($form, "Done.", "CoC2 / TiTS Luna Adapter", "OK", "Information") | Out-Null
        } else {
            [System.Windows.Forms.MessageBox]::Show($form, "Failed. See log for details.", "CoC2 / TiTS Luna Adapter", "OK", "Error") | Out-Null
        }
    } catch {
        Add-Log "Setup error: $($_.Exception.Message)"
        [System.Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, "Setup failed", "OK", "Error") | Out-Null
    } finally {
        $buttonInstall.Enabled = $true
        $buttonUninstall.Enabled = $true
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
    }
}

$buttonInstall.Add_Click({ Run-Setup -Uninstall $false })
$buttonUninstall.Add_Click({ Run-Setup -Uninstall $true })

$form.Add_Shown({
    Add-Log "Tip: click Auto Detect first. If it fails, click Browse and select CoC II.exe or TiTS.exe."
    if ([string]::IsNullOrWhiteSpace($textGame.Text) -or [string]::IsNullOrWhiteSpace($textLuna.Text)) {
        $buttonDetect.PerformClick()
    }
})

[void][System.Windows.Forms.Application]::Run($form)
