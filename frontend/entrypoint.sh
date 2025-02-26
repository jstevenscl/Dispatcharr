#!/bin/sh

apk add nodejs npm
cd /app/
npm i
PORT=3031 npm run start
