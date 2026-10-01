' Runs keep-alive.ps1 with no window at all (a plain PowerShell task would
' flash a console every 2 minutes). Used by the scheduled task and at login.
Dim folder
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & folder & "\keep-alive.ps1""", 0, False
