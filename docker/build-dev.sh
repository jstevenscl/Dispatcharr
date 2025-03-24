#!/bin/bash

docker build --build-arg BRANCH=dev -t dispatcharr/dispatcharr:dev -f Dockerfile ..
