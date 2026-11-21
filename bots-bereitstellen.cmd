@echo off
rem Stellt den Chat-Server (alle Bots + Admin-Panel + CRM) direkt vom PC bei Cloudflare bereit - ohne GitHub.
rem Doppelklick genuegt. Voraussetzungen und Ablauf: OHNE-GITHUB.md
cd /d "%~dp0chatbot"

rem Node.js 22.18 oder neuer wird gebraucht (fuehrt die .ts-Dateien direkt aus)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" 2>nul
if errorlevel 1 (
  echo Node.js fehlt oder ist zu alt. Bitte von nodejs.org die aktuelle LTS-Version installieren, PC neu starten, dann noch einmal.
  goto ende
)

rem Genau die Paket-Versionen aus package-lock.json (keine ungeprueften Updates)
call npm ci || goto fehler
echo.
echo === Tests und Probelauf der Abnahme-Checkliste (ca. 30 Sekunden) ===
call npm test > "%TEMP%\bots-test.log" 2>&1
if errorlevel 1 (
  echo Tests fehlgeschlagen. Es wurde NICHTS bereitgestellt. Details: %TEMP%\bots-test.log
  goto ende
)
call npm run abnahme > "%TEMP%\bots-abnahme.log" 2>&1
if errorlevel 1 (
  echo Probelauf der Abnahme fehlgeschlagen. Es wurde NICHTS bereitgestellt. Details: %TEMP%\bots-abnahme.log
  goto ende
)
echo Tests und Probelauf bestanden.
echo.
echo Jetzt geht der Stand aus DIESEM Ordner live (alle Kunden-Bots, Admin-Panel, CRM).
echo Abbrechen mit Strg+C, weiter mit einer beliebigen Taste.
pause >nul
echo.
echo === Bereitstellen bei Cloudflare ===
call npm run deploy || goto fehler
echo.
echo === Kurzpruefung ===
curl -s -m 20 https://primedetailing-chat.tom-schindler999.workers.dev/health
echo.
curl -s -m 20 -o nul -w "Admin-Panel: HTTP %%{http_code}" https://app.xn--ki-fr-meinen-betrieb-sec.de/admin
echo.
echo Erwartet: {"ok":true,...} und HTTP 200. Sonst: Cloudflare - primedetailing-chat - Deployments - Rollback.
goto ende
:fehler
echo.
echo Es gab einen Fehler (siehe oben). Es wurde nichts oder nicht alles bereitgestellt.
:ende
pause
