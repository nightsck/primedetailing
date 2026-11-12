@echo off
rem Stellt den Chat-Server (alle Bots + Admin-Panel) direkt vom PC bei Cloudflare bereit - ohne GitHub.
rem Doppelklick genuegt. Voraussetzungen und Ablauf: OHNE-GITHUB.md
cd /d "%~dp0chatbot"
call npm install || goto fehler
echo.
echo === Tests laufen (ca. 20 Sekunden) ===
call npm test > "%TEMP%\bots-test.log" 2>&1
if errorlevel 1 (
  echo Tests fehlgeschlagen. Es wurde NICHTS bereitgestellt. Details: %TEMP%\bots-test.log
  goto ende
)
echo Tests bestanden.
echo.
echo === Bereitstellen bei Cloudflare ===
call npm run deploy || goto fehler
echo.
echo Fertig. Pruefen: die Adresse oben + /health
goto ende
:fehler
echo.
echo Es gab einen Fehler (siehe oben). Es wurde nichts oder nicht alles bereitgestellt.
:ende
pause
