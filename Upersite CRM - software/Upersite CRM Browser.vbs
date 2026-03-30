Set WshShell = CreateObject("WScript.Shell")
' 0 executes the command in a hidden window
' We use cmd /c to run the npm command which will start the dev server
WshShell.Run "cmd /c npm run dev", 0
Set WshShell = Nothing

' Wait a moment for the server to start
WScript.Sleep 5000

' Try common Vite ports starting from 5173
Dim ports, port, i
ports = Array(5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 5183, 5184, 5185)

For i = 0 To UBound(ports)
    port = ports(i)
    ' Try to open the browser with this port
    Set WshShell = CreateObject("WScript.Shell")
    On Error Resume Next
    WshShell.Run "http://localhost:" & port
    If Err.Number = 0 Then
        ' If successful, exit the loop
        Exit For
    End If
    On Error GoTo 0
Next

Set WshShell = Nothing
