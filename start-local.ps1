param([string]$MongoExecutable)
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$local = Join-Path (Split-Path $project) '.local'
$logs = Join-Path $local 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$python = Join-Path $project '.venv/Scripts/python.exe'
if (!(Test-Path $python)) { throw 'Create agrilink/.venv and install both Python requirements first. See docs/LOCAL_SETUP.md.' }
foreach ($folder in @('client', 'server', 'blockchain')) {
    if (!(Test-Path (Join-Path $project "$folder/node_modules"))) { throw "Run npm ci in $folder first." }
}
if (!(Test-Path (Join-Path $project 'server/.env'))) { throw 'Create server/.env first. See docs/LOCAL_SETUP.md.' }
function Listening($port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}
function Wait-Port($port) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Listening $port) { return }
        Start-Sleep -Seconds 1
    }
    throw "Port $port did not start. Inspect $logs"
}
function Launch($name, $exe, $arguments, $directory, $port) {
    if (Listening $port) { Write-Host "$name already listening on $port"; return }
    Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs "$name.out.log") `
        -RedirectStandardError (Join-Path $logs "$name.err.log") | Out-Null
}
if (!(Listening 27017)) {
    if (!$MongoExecutable) {
        $found = Get-Command mongod -ErrorAction SilentlyContinue
        if ($found) { $MongoExecutable = $found.Source }
        else { $MongoExecutable = Get-ChildItem (Join-Path $local 'mongodb') -Filter mongod.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
    }
    if (!$MongoExecutable) { throw 'Start MongoDB or pass -MongoExecutable with the path to mongod.exe.' }
    $db = Join-Path $local 'mongo-data'
    New-Item -ItemType Directory -Force $db | Out-Null
    Launch 'mongo' $MongoExecutable "--dbpath `"$db`" --bind_ip 127.0.0.1 --port 27017" $project 27017
}
Wait-Port 27017
$node = (Get-Command node).Source
Launch 'chain' $node 'node_modules/hardhat/internal/cli/cli.js node --hostname 127.0.0.1 --port 8545' (Join-Path $project 'blockchain') 8545
Wait-Port 8545
Launch 'ml' $python '-m uvicorn app.main:app --host 127.0.0.1 --port 8000' (Join-Path $project 'services/ml') 8000
$env:M2_CV_URL = 'http://127.0.0.1:8000'
$env:M2_MONGO_URI = 'mongodb://127.0.0.1:27017'
Launch 'module2' $python '-m uvicorn app.main:app --host 127.0.0.1 --port 8100' (Join-Path $project 'module2/backend') 8100
Launch 'api' $node '--env-file-if-exists=.env src/index.js' (Join-Path $project 'server') 4000
Launch 'web' $node 'node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort' (Join-Path $project 'client') 5173
foreach ($url in @('http://127.0.0.1:8000/health', 'http://127.0.0.1:8100/api/m2/health', 'http://127.0.0.1:4000/api/health', 'http://127.0.0.1:5173/api/health')) {
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try { $null = Invoke-RestMethod $url -TimeoutSec 2; $ready = $true; break }
        catch { Start-Sleep -Seconds 1 }
    }
    if (!$ready) { throw "Service failed: $url. Inspect $logs" }
    Write-Host "Ready: $url"
}
Write-Host "Open http://localhost:5173. Logs: $logs"
