#!/bin/bash
# Get version information
VERSION=$(python -c "import sys; sys.path.append('..'); import version; print(version.__version__)")
BUILD=$(python -c "import sys; sys.path.append('..'); import version; print(version.__build__)")

# Build with version tags
docker build --build-arg BRANCH=dev \
  -t dispatcharr/dispatcharr:dev \
  -t dispatcharr/dispatcharr:${VERSION}-${BUILD} \
  -f Dockerfile ..
.
