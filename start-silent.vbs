' ─────────────────────────────────────────────────────────────────────────────
' CrackCoder Silent Launcher (No terminal / No cmd window at all)
' Double-click this file to launch CrackCoder completely silently.
' ─────────────────────────────────────────────────────────────────────────────
Set objFSO = CreateObject("Scripting.FileSystemObject")
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strDir

' Launch electron.exe directly in background without opening any command window (0 = hide)
WshShell.Run "node_modules\electron\dist\electron.exe .", 0, False
