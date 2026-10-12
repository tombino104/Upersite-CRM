@echo off
rem Avvia Upersite CRM come app desktop (Electron).
rem Se il server di sviluppo e' gia' attivo su 5173 apre solo la finestra,
rem altrimenti avvia server + finestra insieme.
cd /d "%~dp0"
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if %errorlevel%==0 (
    call npx electron .
) else (
    call npm run electron:dev
)
