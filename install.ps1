param(
    [string[]]$Skill,
    [switch]$All,
    [string]$Destination = (Join-Path -Path $env:USERPROFILE -ChildPath '.codex\skills'),
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$KnownSkills = @(
    'jianzhuxuezhang-image'
)

if (-not $All -and (-not $Skill -or $Skill.Count -eq 0)) {
    throw 'Specify -All, or one or more skill names with -Skill.'
}

$requested = if ($All) { $KnownSkills } else { $Skill }
$invalid = @($requested | Where-Object { $_ -notin $KnownSkills })
if ($invalid.Count -gt 0) {
    throw "Unknown skill(s): $($invalid -join ', ')."
}

function Get-SkillSnapshot {
    param([string]$Path)

    $sourcePrefix = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
    Get-ChildItem -LiteralPath $Path -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
        $fullPath = [IO.Path]::GetFullPath($_.FullName)
        $relative = $fullPath.Substring($sourcePrefix.Length).Replace('\', '/')
        $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
        [pscustomobject]@{
            RelativePath = $relative
            Length = $_.Length
            Sha256 = $hash.Hash
        }
    }
}

function Test-SnapshotEqual {
    param($SourceSnapshot, $TargetSnapshot)

    if ($SourceSnapshot.Count -ne $TargetSnapshot.Count) { return $false }
    for ($i = 0; $i -lt $SourceSnapshot.Count; $i++) {
        if (
            $SourceSnapshot[$i].RelativePath -ne $TargetSnapshot[$i].RelativePath -or
            $SourceSnapshot[$i].Length -ne $TargetSnapshot[$i].Length -or
            $SourceSnapshot[$i].Sha256 -ne $TargetSnapshot[$i].Sha256
        ) {
            return $false
        }
    }
    return $true
}

if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
    if ($WhatIf) {
        Write-Host "Would create destination: $Destination"
    } else {
        New-Item -Path $Destination -ItemType Directory -Force | Out-Null
    }
}

$results = foreach ($name in $requested) {
    $source = Join-Path -Path (Join-Path -Path $PSScriptRoot -ChildPath 'skills') -ChildPath $name
    $target = Join-Path -Path $Destination -ChildPath $name

    if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md') -PathType Leaf)) {
        throw "Source skill is invalid: $source"
    }

    if (Test-Path -LiteralPath $target) {
        if (-not (Test-Path -LiteralPath (Join-Path $target 'SKILL.md') -PathType Leaf)) {
            throw "Target exists but is not a complete skill; resolve it manually: $target"
        }

        $same = Test-SnapshotEqual `
            -SourceSnapshot (Get-SkillSnapshot -Path $source) `
            -TargetSnapshot (Get-SkillSnapshot -Path $target)
        if ($same) {
            [pscustomobject]@{ Skill = $name; Action = 'already-current'; Target = $target }
            continue
        }

        throw "Target skill differs; this installer never overwrites: $target"
    }

    if ($WhatIf) {
        [pscustomobject]@{ Skill = $name; Action = 'would-install'; Target = $target }
        continue
    }

    Copy-Item -LiteralPath $source -Destination $target -Recurse
    if (-not (Test-Path -LiteralPath (Join-Path $target 'SKILL.md') -PathType Leaf)) {
        throw "Installation verification failed for: $target"
    }
    [pscustomobject]@{ Skill = $name; Action = 'installed'; Target = $target }
}

$results | Format-Table -AutoSize
