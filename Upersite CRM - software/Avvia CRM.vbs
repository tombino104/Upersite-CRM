Set WshShell = CreateObject("WScript.Shell")
' 0 executes the command in a hidden window
' We use cmd /c to run the npm command which will then start Electron
WshShell.Run "cmd /c npm run electron:dev", 0
Set WshShell = Nothing
