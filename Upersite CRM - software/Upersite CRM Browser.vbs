' Upersite CRM - avvio nel browser, senza finestre del terminale.
' Se il CRM e' gia' acceso apre solo il browser, altrimenti avvia il server e aspetta che sia pronto.
Option Explicit
Dim shell, fso, i
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

If Not CrmIsRunning() Then
    shell.Run "cmd /c npm run dev", 0, False
    For i = 1 To 60
        WScript.Sleep 1000
        If CrmIsRunning() Then Exit For
    Next
    If Not CrmIsRunning() Then
        MsgBox "Il CRM non si e' avviato entro 60 secondi." & vbCrLf & _
               "Controlla che la porta 5173 non sia usata da un altro programma," & vbCrLf & _
               "oppure avvialo da terminale con: npm run dev", vbExclamation, "Upersite CRM"
        WScript.Quit 1
    End If
End If

shell.Run "http://localhost:5173"

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
