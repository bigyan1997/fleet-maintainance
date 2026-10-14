' Runs the nightly database backup with no visible window (used by the
' scheduled task "Fleet Maintenance Backup"). Log: backend\logs\backup.log
Set fso = CreateObject("Scripting.FileSystemObject")
backend = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "backend")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = backend
shell.Run """" & fso.BuildPath(backend, ".venv\Scripts\python.exe") & """ manage.py backup_database", 0, False
