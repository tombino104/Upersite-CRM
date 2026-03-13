@echo off
title Avvio Upersite CRM Browser
echo Avvio del server di sviluppo...
start /B npm run dev
timeout /t 5 /nobreak > nul
echo Apertura del browser...
start http://localhost:5173
echo CRM avviato! Puoi chiudere questa finestra.
pause
