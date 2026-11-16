$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $projectRoot ('.local/nuit-test-' + [guid]::NewGuid().ToString('N'))
$originalPath = $env:PATH
try {
  foreach ($scenario in @('complete', 'stderr', 'failure', 'report')) {
    $fixture = Join-Path $testRoot $scenario
    $fixtureTools = Join-Path $fixture 'tools'
    $fixtureBin = Join-Path $fixture 'bin'
    New-Item -ItemType Directory -Force -Path $fixtureTools,$fixtureBin | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nuit.ps1') -Destination (Join-Path $fixtureTools 'nuit.ps1')
    Set-Content -LiteralPath (Join-Path $fixture 'PROGRESS.md') -Value '- [ ] Test' -Encoding UTF8
    if ($scenario -eq 'complete' -or $scenario -eq 'report') {
      Set-Content -LiteralPath (Join-Path $fixture 'PROGRESS.md') -Value '- [x] Test' -Encoding UTF8
    }
    if ($scenario -eq 'complete') {
      Set-Content -LiteralPath (Join-Path $fixture 'RAPPORT_FINAL.md') -Value '# Test' -Encoding UTF8
    }
    $stub = @'
@echo off
echo invoked>>invocations.txt
echo Recoverable image diagnostic 1>&2
echo {"type":"thread.started","thread_id":"test-session"}
echo {"type":"turn.completed"}
echo - [x] Test>PROGRESS.md
echo # Test>RAPPORT_FINAL.md
exit /b 0
'@
    if ($scenario -eq 'failure') { $stub = $stub.Replace('exit /b 0', 'exit /b 7') }
    Set-Content -LiteralPath (Join-Path $fixtureBin 'codex.cmd') -Value $stub -Encoding ASCII
    $env:PATH = $fixtureBin + [IO.Path]::PathSeparator + $originalPath
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $fixtureTools 'nuit.ps1') *> (Join-Path $fixture 'launcher.log')
    $result = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $status = Get-Content -LiteralPath (Join-Path $fixture '.local/nuit/status.txt') -Raw
    if ($scenario -eq 'failure') {
      if ($result -eq 0 -or $status -notlike '*code 7*') { throw 'A real nonzero exit must stop the launcher.' }
    } else {
      if ($result -ne 0 -or $status -notlike '*Termine*') { throw "$scenario failed: $status" }
      $invoked = Test-Path -LiteralPath (Join-Path $fixture 'invocations.txt')
      if ($scenario -eq 'complete' -and $invoked) { throw 'A completed project must not invoke Codex.' }
      if ($scenario -ne 'complete' -and -not $invoked) { throw 'An incomplete delivery must invoke Codex.' }
      if ($scenario -eq 'stderr') {
        $diagnostic = Get-Content -LiteralPath (Join-Path $fixture '.local/nuit/run-00.stderr.log') -Raw
        if ($diagnostic -notlike '*Recoverable image diagnostic*') { throw 'stderr must remain in its log.' }
      }
    }
    Write-Output "$scenario : OK"
  }
} finally {
  $env:PATH = $originalPath
}
