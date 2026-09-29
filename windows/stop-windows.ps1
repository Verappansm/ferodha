<#
.SYNOPSIS
  Stops everything windows/start-windows.ps1 started on this machine.
  Kafka on the Linux host is left alone - stop it there with
  ./windows/kafka-linux.sh down
#>
$ErrorActionPreference = 'Stop'

$PidFile = Join-Path $PSScriptRoot '.run\pids.json'
if (-not (Test-Path $PidFile)) {
    Write-Host 'Nothing to stop (no windows\.run\pids.json).'
    exit 0
}

foreach ($entry in @(Get-Content $PidFile -Raw | ConvertFrom-Json)) {
    $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    # Only java/node: a PID left over from an earlier run may since have been
    # reused by an unrelated process.
    if ($proc -and $proc.ProcessName -in 'java', 'node') {
        Stop-Process -Id $entry.pid -Force
        Write-Host "stopped $($entry.name) (pid $($entry.pid))"
    } else {
        Write-Host "$($entry.name) (pid $($entry.pid)) was not running"
    }
}

Remove-Item $PidFile -Force
