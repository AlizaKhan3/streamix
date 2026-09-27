# ============================================================
# FAILOVER DEMO (Windows PowerShell)
#
#   1. writes go to pk-movie-f0-primary
#   2. we stop that primary (simulated crash)
#   3. reads keep working — the router falls back to the replica
#   4. an admin promotes the replica (pg_promote) through the API
#   5. writes work again, now on the promoted node
#
# Usage (backend running via docker compose, seeded):
#   powershell -ExecutionPolicy Bypass -File scripts\failover-demo.ps1
# Restore afterwards with:  docker compose down -v ; docker compose up -d ; npm run seed
# ============================================================
$ErrorActionPreference = 'Stop'
$api = 'http://localhost:4001'

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }

Step 'Log in as the PK admin'
$login = Invoke-RestMethod -Method Post -Uri "$api/auth/login" -ContentType 'application/json' `
  -Body (@{ email = 'admin@streamix.pk'; password = 'Admin@123' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }

Step 'Read Inception (content_id 27205 -> fragment F0)'
$movie = Invoke-RestMethod -Uri "$api/catalog/movie/27205"
Write-Host "served by: $($movie._servedBy.node) ($($movie._servedBy.role))"

Step 'Crash the F0 primary'
docker stop pk-movie-f0-primary | Out-Null
Write-Host 'pk-movie-f0-primary stopped'

Step 'Reads still work (replica)'
$movie = Invoke-RestMethod -Uri "$api/catalog/movie/27205"
Write-Host "served by: $($movie._servedBy.node) ($($movie._servedBy.role))"

Step 'Writes fail until a new primary exists'
try {
  Invoke-RestMethod -Method Patch -Uri "$api/admin/movies/27205" -Headers $headers -ContentType 'application/json' `
    -Body (@{ admin_note = 'write during outage' } | ConvertTo-Json) | Out-Null
  Write-Host 'unexpected: write succeeded'
} catch {
  Write-Host "write rejected as expected: $($_.ErrorDetails.Message)"
}

Step 'Promote pk-movie-f0-replica (pg_promote)'
$promoted = Invoke-RestMethod -Method Post -Uri "$api/admin/failover" -Headers $headers -ContentType 'application/json' `
  -Body (@{ kind = 'movie-f0' } | ConvertTo-Json)
$promoted | ConvertTo-Json

Step 'Writes work again on the promoted node'
$updated = Invoke-RestMethod -Method Patch -Uri "$api/admin/movies/27205" -Headers $headers -ContentType 'application/json' `
  -Body (@{ admin_note = "written after failover at $(Get-Date -Format s)" } | ConvertTo-Json)
Write-Host "admin_note = $($updated.admin_note)"
Write-Host "vclock     = $($updated.vclock | ConvertTo-Json -Compress)"

Step 'Done'
Write-Host 'The old primary is still stopped. To reset the cluster: docker compose down -v; docker compose up -d; npm run seed'
