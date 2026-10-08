# prepare-parish-assets.ps1 — generate web-ready icons from a parish logo.
#
# Usage:
#   .\scripts\prepare-parish-assets.ps1 -BrandDir "public\brands\san-raphael" -Source "logo.jpg"
#
# Reads <BrandDir>\<Source> (any format GDI+ reads) and writes:
#   logo.png      full-size PNG (favicon / apple-touch-icon)
#   icon-192.png  192x192 PWA icon
#   icon-512.png  512x512 PWA icon
#
# Uses .NET System.Drawing — no npm dependencies, works on stock Windows.

param(
    [Parameter(Mandatory = $true)][string]$BrandDir,
    [string]$Source = "logo.jpg"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $BrandDir $Source
if (-not (Test-Path $srcPath)) { throw "Source image not found: $srcPath" }

$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath))

function Save-ResizedPng($img, [int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $outPath"
}

Save-ResizedPng $src 192 (Join-Path $BrandDir "icon-192.png")
Save-ResizedPng $src 512 (Join-Path $BrandDir "icon-512.png")

# Full-size PNG conversion (favicon / apple-touch-icon)
$pngPath = Join-Path $BrandDir "logo.png"
$src.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "wrote $pngPath"

$src.Dispose()
Write-Host "Done. Brand assets ready in $BrandDir"
