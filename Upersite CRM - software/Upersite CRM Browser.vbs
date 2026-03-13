Set WshShell = CreateObject("WScript.Shell")
' 0 executes the command in a hidden window
' We use cmd /c to run the npm command which will start the dev server
WshShell.Run "cmd /c npm run dev", 0
Set WshShell = Nothing

' Wait a moment for the server to start
WScript.Sleep 3000

' Open the browser automatically
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "http://localhost:5173"
Set WshShell = Nothing
