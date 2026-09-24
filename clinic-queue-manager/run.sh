#!/bin/sh
cd "$(dirname "$0")" && mkdir -p out && javac -d out backend/Main.java && java -Dweb=frontend -cp out Main
