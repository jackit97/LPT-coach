Add-Type -AssemblyName System.Drawing

$source = "c:\Users\Giacomo\LPT coach\LPT-coach\lptcoach_icon.jpg"
$assetsDir = "c:\Users\Giacomo\LPT coach\LPT-coach\app\assets"

function New-SquareCanvas([int]$size, [System.Drawing.Color]$bgColor) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($bgColor)
    return @{ Bitmap = $bmp; Graphics = $g }
}

$src = [System.Drawing.Image]::FromFile($source)

# Center-crop source to a square
$cropSize = [Math]::Min($src.Width, $src.Height)
$offsetX = [int](($src.Width - $cropSize) / 2)
$offsetY = [int](($src.Height - $cropSize) / 2)
$cropRect = New-Object System.Drawing.Rectangle($offsetX, $offsetY, $cropSize, $cropSize)

$squareBmp = New-Object System.Drawing.Bitmap($cropSize, $cropSize)
$gCrop = [System.Drawing.Graphics]::FromImage($squareBmp)
$gCrop.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $cropSize, $cropSize)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$gCrop.Dispose()
$src.Dispose()

# 1) icon.png - full-bleed square icon (1024x1024)
$canvas = New-SquareCanvas 1024 ([System.Drawing.Color]::White)
$canvas.Graphics.DrawImage($squareBmp, 0, 0, 1024, 1024)
$canvas.Graphics.Dispose()
$canvas.Bitmap.Save("$assetsDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Bitmap.Dispose()

# 2) adaptive-icon.png - logo scaled to ~80% centered, safe for Android mask cropping
$canvas2 = New-SquareCanvas 1024 ([System.Drawing.Color]::White)
$logoSize = 820
$offset = [int]((1024 - $logoSize) / 2)
$canvas2.Graphics.DrawImage($squareBmp, $offset, $offset, $logoSize, $logoSize)
$canvas2.Graphics.Dispose()
$canvas2.Bitmap.Save("$assetsDir\adaptive-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$canvas2.Bitmap.Dispose()

# 3) splash-icon.png - logo centered on transparent-ish white canvas
$canvas3 = New-SquareCanvas 1024 ([System.Drawing.Color]::White)
$splashLogo = 600
$offset3 = [int]((1024 - $splashLogo) / 2)
$canvas3.Graphics.DrawImage($squareBmp, $offset3, $offset3, $splashLogo, $splashLogo)
$canvas3.Graphics.Dispose()
$canvas3.Bitmap.Save("$assetsDir\splash-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$canvas3.Bitmap.Dispose()

# 4) favicon.png - small square for web
$canvas4 = New-SquareCanvas 196 ([System.Drawing.Color]::White)
$canvas4.Graphics.DrawImage($squareBmp, 0, 0, 196, 196)
$canvas4.Graphics.Dispose()
$canvas4.Bitmap.Save("$assetsDir\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$canvas4.Bitmap.Dispose()

$squareBmp.Dispose()

Write-Output "Icons generated in $assetsDir"
