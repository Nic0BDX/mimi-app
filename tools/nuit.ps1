$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$logDirectory = Join-Path $projectRoot '.local/nuit'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$mutex = New-Object System.Threading.Mutex($false, 'Local\mimi-app-codex-nuit')
if (-not $mutex.WaitOne(0)) { throw 'Une session nuit est deja active pour ce projet.' }
$codexCommand = (Get-Command codex.cmd -ErrorAction Stop).Source
$sessionId = $null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class NuitPower {
  [DllImport("kernel32.dll")]
  public static extern uint SetThreadExecutionState(uint flags);
}
'@
function Write-Status([string]$message) {
  [IO.File]::WriteAllText((Join-Path $logDirectory 'status.txt'), ((Get-Date -Format o) + ' ' + $message), $utf8)
}
try {
  [NuitPower]::SetThreadExecutionState([uint32]2147483649) | Out-Null
  [IO.File]::WriteAllText((Join-Path $logDirectory 'pid.txt'), [string]$PID, $utf8)
  for ($attempt = 0; $attempt -le 30; $attempt++) {
    if (-not (Select-String -LiteralPath 'PROGRESS.md' -Pattern '^\s*[-*]\s+\[ \]' -Quiet) -and (Test-Path -LiteralPath 'RAPPORT_FINAL.md')) {
      Write-Status 'Termine : PROGRESS.md coche et RAPPORT_FINAL.md present.'
      break
    }
    Write-Status "Execution $attempt / 30"
    $arguments = @('-a', 'never', '-s', 'workspace-write', 'exec')
    if ($sessionId) {
      $arguments += @('resume', '--json', $sessionId, 'Continue sans poser de question. Decide seul. Reprends PROGRESS.md et fais le prochain element non coche. Ne coche que les travaux verifies. Respecte les regles economie de tokens dans DECISIONS.md.')
    } else {
      $arguments += @('--json', 'Lis AGENTS.md, DECISIONS.md et PROGRESS.md puis continue le projet jusqu au bout sans poser de question. Preserve les modifications locales. Termine les six jeux et reproduis la maquette NIMIMI. Ne coche que les travaux verifies.')
    }
    $logPath = Join-Path $logDirectory ("run-{0:D2}.jsonl" -f $attempt)
    # Windows PowerShell turns native stderr diagnostics into terminating errors
    # with Stop, even when Codex exits successfully. Preserve stderr in its log
    # and decide whether the invocation failed using its actual exit code.
    $previousErrorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & $codexCommand @arguments 2> (Join-Path $logDirectory ("run-{0:D2}.stderr.log" -f $attempt)) | ForEach-Object {
      [IO.File]::AppendAllText($logPath, ([string]$_ + [Environment]::NewLine), $utf8)
      try {
        $event = $_ | ConvertFrom-Json
        Write-Status ("Execution $attempt / 30 : " + $event.type)
        if ($event.type -eq 'thread.started' -and $event.thread_id) {
          $sessionId = $event.thread_id
          [IO.File]::WriteAllText((Join-Path $logDirectory 'session.txt'), $sessionId, $utf8)
        }
      } catch { }
      }
      $codexExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorPreference
    }
    if ($codexExitCode -ne 0) { throw "Codex a echoue (code $codexExitCode). Voir $logPath et le journal stderr correspondant." }
    if (-not $sessionId) { throw 'Aucun identifiant de session retourne : reprise automatique impossible.' }
    if (-not (Select-String -LiteralPath 'PROGRESS.md' -Pattern '^\s*[-*]\s+\[ \]' -Quiet) -and (Test-Path -LiteralPath 'RAPPORT_FINAL.md')) {
      Write-Status 'Termine : PROGRESS.md coche et RAPPORT_FINAL.md present.'
      break
    }
    if ($attempt -eq 30) { Write-Status 'Limite de 30 reprises atteinte. Consulter PROGRESS.md.' }
  }
} catch {
  Write-Status ("Echec : " + $_.Exception.Message)
  throw
} finally {
  [NuitPower]::SetThreadExecutionState([uint32]2147483648) | Out-Null
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
