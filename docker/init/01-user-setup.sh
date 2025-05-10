#!/bin/bash

# Set up user details
export PUID=${PUID:-1000}
export PGID=${PGID:-1000}

# Check if group with PGID exists
if getent group "$PGID" >/dev/null 2>&1; then
    # Group exists, check if it's named 'dispatch'
    existing_group=$(getent group "$PGID" | cut -d: -f1)
    if [ "$existing_group" != "dispatch" ]; then
        # Rename the existing group to 'dispatch'
        groupmod -n "dispatch" "$existing_group"
        echo "Group $existing_group with GID $PGID renamed to dispatch"
    fi
else
    # Group doesn't exist, create it
    groupadd -g "$PGID" dispatch
    echo "Group dispatch with GID $PGID created"
fi

# Create user if it doesn't exist
if ! getent passwd $PUID > /dev/null 2>&1; then
    useradd -u $PUID -g $PGID -m $POSTGRES_USER
else
    existing_user=$(getent passwd $PUID | cut -d: -f1)
    if [ "$existing_user" != "$POSTGRES_USER" ]; then
        usermod -l $POSTGRES_USER -g $PGID "$existing_user"
    fi
fi

# Add user to video and render groups if they exist
if getent group video >/dev/null 2>&1; then
    usermod -a -G video $POSTGRES_USER
    echo "Added user $POSTGRES_USER to video group for hardware acceleration access"
fi

if getent group render >/dev/null 2>&1; then
    usermod -a -G render $POSTGRES_USER
    echo "Added user $POSTGRES_USER to render group for GPU access"
fi

# Run nginx as specified user
sed -i 's/user www-data;/user dispatch;/g' /etc/nginx/nginx.conf
