$url = "https://thunder-lake-systems-ops.vercel.app/api/income/discover"
$logFile = "$PSScriptRoot\..\logs\auto-scan.log"

try {
    $r = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 90
    $body = $r.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
    $msg = if ($body.ok) { "OK +$($body.new) new" } else { "OK (no body)" }
    Add-Content $logFile "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
} catch {
    Add-Content $logFile "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  FAILED: $_"
}
