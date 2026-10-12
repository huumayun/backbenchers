$ErrorActionPreference = "Stop"

Write-Host "--- 1. Generating Book Bundle ---"
npx tsx scripts/generate_bundle.ts

Write-Host "--- 2. Cleaning previous .next and out directories ---"
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "out" -ErrorAction SilentlyContinue

Write-Host "--- 3. Running Next.js Static Export Build ---"
for ($i = 0; $i -lt 5; $i++) {
    try {
        if (Test-Path "app\api") {
            Move-Item "app\api" ".api-backup" -Force
        }
        break
    } catch {
        Write-Host "Retrying Move-Item ($i)..."
        Start-Sleep -Seconds 1
    }
}

try {
    $env:CAPACITOR_BUILD = "1"
    npx next build
} finally {
    $env:CAPACITOR_BUILD = ""
    for ($i = 0; $i -lt 5; $i++) {
        try {
            if (Test-Path ".api-backup") {
                Move-Item ".api-backup" "app\api" -Force
            }
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }
}

Write-Host "--- 4. Ensuring clean assets without recursive APK ---"
Copy-Item "public\book-bundle.json" "out\book-bundle.json" -Force
Remove-Item "out\Backbencher.apk" -Force -ErrorAction SilentlyContinue

Write-Host "--- 5. Capacitor Sync Android ---"
npx cap sync android

Write-Host "--- 6. Ensuring book-bundle.json in Android assets and removing nested APK ---"
New-Item -ItemType Directory -Force "android\app\src\main\assets\public" | Out-Null
Copy-Item "public\book-bundle.json" "android\app\src\main\assets\public\book-bundle.json" -Force
Remove-Item "android\app\src\main\assets\public\Backbencher.apk" -Force -ErrorAction SilentlyContinue

Write-Host "--- 7. Building Android Debug APK ---"
Push-Location android
try {
    .\gradlew.bat assembleDebug
} finally {
    Pop-Location
}

Write-Host "--- 8. Copying Fresh APK to public/Backbencher.apk ---"
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "public\Backbencher.apk" -Force
$apkSize = (Get-Item "public\Backbencher.apk").Length / 1MB
Write-Host ("--- Complete! Fresh APK generated at public\Backbencher.apk ({0:N2} MB) ---" -f $apkSize)
