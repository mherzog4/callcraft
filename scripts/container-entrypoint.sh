#!/bin/sh
set -eu

# Railway mounts a fresh volume after the image is built, so image-layer ownership
# does not apply to /data. Fix only the mount root, then run all application code
# as the unprivileged node UID/GID.
if [ -d /data ]; then
  chown 1000:1000 /data
fi

exec setpriv --reuid=1000 --regid=1000 --init-groups "$@"
