#!/bin/sh

apk add nodejs npm
cd /app/
npm i
PORT=9191 npm run start
