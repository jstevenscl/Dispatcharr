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

# Check if render group exists, if not create it with GID 109
#if getent group render >/dev/null 2>&1; then
#    current_gid=$(getent group render | cut -d: -f3)
#    if [ "$current_gid" != "109" ]; then
#        groupmod -g 109 render
#        echo "Changed render group GID from $current_gid to 109"
#    fi
#else
#    groupadd -g 109 render
#    echo "Created render group with GID 109"
#fi

# Check if render group exists before trying to add user to it
if getent group render >/dev/null 2>&1; then
    # Render group exists, check if user is already in it
    if id -nG "$POSTGRES_USER" | grep -qw "render"; then
        echo "User $POSTGRES_USER is already in render group"
    else
        usermod -a -G render $POSTGRES_USER
        echo "Added user $POSTGRES_USER to render group for GPU access"
    fi
else
    echo "Render group does not exist, skipping adding user to render group"
fi

# Add user to video group if it exists
if getent group video >/dev/null 2>&1; then
    usermod -a -G video $POSTGRES_USER
    echo "Added user $POSTGRES_USER to video group for hardware acceleration access"
fi

# Run nginx as specified user
sed -i 's/user www-data;/user dispatch;/g' /etc/nginx/nginx.conf
