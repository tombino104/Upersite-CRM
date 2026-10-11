' Upersite CRM - avvio come app desktop (Electron), senza finestre del terminale.
' Se il server del CRM e' gia' acceso (es. aperto nel browser) apre solo la finestra desktop.
Option Explicit
Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

If CrmIsRunning() Then
    shell.Run "cmd /c npx electron .", 0, False
Else
    shell.Run "cmd /c npm run electron:dev", 0, False
End If

' Il server di Vite puo' ascoltare su IPv4 o IPv6: proviamo entrambi
Function CrmIsRunning()
    CrmIsRunning = Responds("http://127.0.0.1:5173/api/storage-info") Or Responds("http://[::1]:5173/api/storage-info")
End Function

Function Responds(url)
    Dim http
    Responds = False
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 1000, 1000, 1000, 1000
    http.Open "GET", url, False
    http.Send
    If Err.Number = 0 Then Responds = (http.Status = 200)
    On Error GoTo 0
End Function
