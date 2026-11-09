// Teams meeting detection (v1 TeamsMeetingDetector): a meeting is in progress when a Teams window
// exposes an enabled "Leave"/"Hang up" button through the Windows accessibility API.
// A single long-lived PowerShell process polls every 3 seconds and prints 1 (meeting), 0 (none) or
// E (detection failure) on its standard output, which avoids starting a process for every check.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

const POLL_SECONDS = 3;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$labels = @('leave', 'leave meeting', 'hang up', 'quitter', 'quitter la réunion', 'raccrocher')
$automation = [System.Windows.Automation.AutomationElement]
$buttonCondition = New-Object System.Windows.Automation.PropertyCondition($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)

function Test-LeaveButton($button) {
  $current = $button.Current
  if (-not $current.IsEnabled) { return $false }
  if ($current.AutomationId -ieq 'hangup-button') { return $true }
  $name = ([string]$current.Name).ToLowerInvariant()
  foreach ($label in $labels) {
    if ($name -eq $label -or $name.StartsWith("$label (")) { return $true }
  }
  return $false
}

function Test-TeamsMeeting {
  $processes = Get-Process -Name 'ms-teams', 'msteams', 'Teams' -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    $processCondition = New-Object System.Windows.Automation.PropertyCondition($automation::ProcessIdProperty, $process.Id)
    $windows = $automation::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $processCondition)
    foreach ($window in $windows) {
      foreach ($button in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)) {
        if (Test-LeaveButton $button) { return $true }
      }
    }
  }
  return $false
}

while ($true) {
  try { if (Test-TeamsMeeting) { '1' } else { '0' } } catch { 'E' }
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${POLL_SECONDS}
}
`;

/** Receives true (meeting), false (no meeting) or null (detection failed). */
export type TeamsListener = (inMeeting: boolean | null) => void;

export class TeamsMeetingDetector {
  private process: ChildProcess | null = null;

  constructor(private readonly listener: TeamsListener) {}

  get running(): boolean {
    return this.process !== null;
  }

  start(): void {
    if (this.process || process.platform !== 'win32') {
      if (process.platform !== 'win32') {
        this.listener(false);
      }

      return;
    }

    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    this.process = child;
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const value = line.trim();
      this.listener(value === '1' ? true : value === '0' ? false : null);
    });
    child.on('error', () => this.onExit(child));
    child.on('exit', () => this.onExit(child));
  }

  stop(): void {
    const child = this.process;
    this.process = null;
    child?.kill();
  }

  private onExit(child: ChildProcess): void {
    if (this.process === child) {
      this.process = null;
      this.listener(null);
    }
  }
}
