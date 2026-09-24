@echo off
cd /d "%~dp0"
if not exist out mkdir out
javac -d out backend\Main.java && java -Dweb=frontend -cp out Main
