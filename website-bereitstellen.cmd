@echo off
rem Baut die Website primedetailing.eu und stellt sie bei Cloudflare Pages bereit - ohne GitHub.
rem Vorher einmalig das Pages-Projekt anlegen, siehe OHNE-GITHUB.md (Abschnitt Website).
cd /d "%~dp0"
call npm install || goto fehler
call npm run build || goto fehler
call npx wrangler pages deploy _site --project-name primedetailing --branch main || goto fehler
echo.
echo Fertig. Die Website ist aktualisiert.
goto ende
:fehler
echo.
echo Es gab einen Fehler (siehe oben).
:ende
pause
