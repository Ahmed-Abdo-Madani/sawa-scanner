$confPath = "C:\Program Files\Redis\redis.windows-service.conf"
if (Test-Path $confPath) {
    Write-Host "Reading configuration from $confPath"
    $content = Get-Content $confPath
    
    # Replace bind
    $content = $content -replace "bind 127.0.0.1", "bind 0.0.0.0"
    
    # Replace protected-mode
    $content = $content -replace "protected-mode yes", "protected-mode no"
    
    # Save back
    $content | Set-Content $confPath
    Write-Host "Successfully updated configuration file."
    
    # Restart service
    Write-Host "Restarting Redis service..."
    Restart-Service Redis
    Write-Host "Redis service restarted successfully."
} else {
    Write-Error "Redis configuration file not found at $confPath"
}
