#!/bin/bash

echo "🔍 Checking for GPU acceleration devices..."

# Helper function for device access checks
check_dev() {
    local dev=$1
    if [ -e "$dev" ]; then
        if [ -r "$dev" ] && [ -w "$dev" ]; then
            echo "✅ Device $dev is accessible."
        else
            echo "⚠️ Device $dev exists but is not accessible. Check permissions or container runtime options."
        fi
    else
        echo "ℹ️ Device $dev does not exist."
    fi
}

# Check Intel/AMD VAAPI devices
echo "🔍 Checking for Intel/AMD (VAAPI) devices..."
for dev in /dev/dri/renderD* /dev/dri/card*; do
    [ -e "$dev" ] && check_dev "$dev"
done

# Check NVIDIA device nodes
echo "🔍 Checking for NVIDIA devices..."
NVIDIA_FOUND=false
for dev in /dev/nvidia*; do
    [ -e "$dev" ] && NVIDIA_FOUND=true && check_dev "$dev"
done
if [ "$NVIDIA_FOUND" = false ]; then
    echo "ℹ️ No NVIDIA device nodes found under /dev."
fi

# Check group membership for GPU access - context-aware based on hardware
echo "🔍 Checking user group memberships..."
VIDEO_GID=$(getent group video | cut -d: -f3)
RENDER_GID=$(getent group render | cut -d: -f3)
NVIDIA_CONTAINER_TOOLKIT_FOUND=false

# Check if NVIDIA Container Toolkit is present through environment or CLI tool
if command -v nvidia-container-cli >/dev/null 2>&1; then
    NVIDIA_CONTAINER_TOOLKIT_FOUND=true
# Check for environment variables set by NVIDIA Container Runtime
elif [ -n "$NVIDIA_VISIBLE_DEVICES" ] && [ -n "$NVIDIA_DRIVER_CAPABILITIES" ]; then
    NVIDIA_CONTAINER_TOOLKIT_FOUND=true
    echo "✅ NVIDIA Container Toolkit detected (via environment variables)."
    echo "   The container is properly configured with Docker Compose's 'driver: nvidia' syntax."
fi

# For NVIDIA GPUs with Container Toolkit, video group is optional
if [ "$NVIDIA_FOUND" = true ] && [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = true ]; then
    if [ -n "$VIDEO_GID" ] && id -G | grep -qw "$VIDEO_GID"; then
        echo "✅ User is in the 'video' group (GID $VIDEO_GID)."
        echo "   Note: With NVIDIA Container Toolkit properly configured, this is usually not required."
    elif [ -n "$VIDEO_GID" ]; then
        echo "ℹ️ User is not in the 'video' group, but NVIDIA Container Toolkit is present."
        echo "   This is typically fine as the Container Toolkit handles device permissions."
    fi
# For other GPU types (or NVIDIA without Toolkit), video/render group is important
else
    if [ -n "$VIDEO_GID" ]; then
        if id -G | grep -qw "$VIDEO_GID"; then
            echo "✅ User is in the 'video' group (GID $VIDEO_GID)."
        else
            echo "⚠️ User is NOT in the 'video' group (GID $VIDEO_GID). Hardware acceleration may not work."
        fi
    elif [ -n "$RENDER_GID" ]; then
        if id -G | grep -qw "$RENDER_GID"; then
            echo "✅ User is in the 'render' group (GID $RENDER_GID)."
        else
            echo "⚠️ User is NOT in the 'render' group (GID $RENDER_GID). Hardware acceleration may not work."
        fi
    else
        echo "⚠️ Neither 'video' nor 'render' groups found on this system."
    fi
fi

# Check NVIDIA Container Toolkit support
echo "🔍 Checking NVIDIA container runtime support..."
if command -v nvidia-container-cli >/dev/null 2>&1; then
    echo "✅ NVIDIA Container Toolkit detected (nvidia-container-cli found)."

    if nvidia-container-cli info >/dev/null 2>&1; then
        echo "✅ NVIDIA container runtime is functional."
    else
        echo "⚠️ nvidia-container-cli found, but 'info' command failed. Runtime may be misconfigured."
    fi
elif [ -n "$NVIDIA_VISIBLE_DEVICES" ] && [ -n "$NVIDIA_DRIVER_CAPABILITIES" ]; then
    echo "✅ NVIDIA Container Toolkit detected through environment variables."
    echo "   Your Docker Compose configuration with 'driver: nvidia' and 'capabilities: [gpu]' is working correctly."
    echo "   This is the modern, recommended way to use NVIDIA GPUs with containers."
else
    echo "ℹ️ NVIDIA Container Toolkit not detected."

    # Only show this message if NVIDIA devices are found but toolkit is missing
    if [ "$NVIDIA_FOUND" = true ]; then
        echo "ℹ️ You appear to be using direct device passthrough for NVIDIA GPU access."
        echo "   This method works, but consider using Docker Compose's 'deploy' configuration:"
        echo "   deploy:"
        echo "     resources:"
        echo "       reservations:"
        echo "         devices:"
        echo "           - driver: nvidia"
        echo "             count: all"
        echo "             capabilities: [gpu]"
    fi
fi

# Run nvidia-smi if available
if command -v nvidia-smi >/dev/null 2>&1; then
    echo "🔍 Running nvidia-smi to verify GPU visibility..."
    if nvidia-smi >/dev/null 2>&1; then
        echo "✅ nvidia-smi successful - GPU is accessible to container!"
        echo "   This confirms hardware acceleration should be available to FFmpeg."
    else
        echo "⚠️ nvidia-smi command failed. GPU may not be properly mapped into container."
    fi
else
    echo "ℹ️ nvidia-smi not installed or not in PATH."
fi

# Show relevant environment variables with contextual suggestions
echo "🔍 Checking GPU-related environment variables..."

# Set flags based on device detection
DRI_DEVICES_FOUND=false
for dev in /dev/dri/renderD* /dev/dri/card*; do
    if [ -e "$dev" ]; then
        DRI_DEVICES_FOUND=true
        break
    fi
done

# Give contextual suggestions based on detected hardware
if [ "$DRI_DEVICES_FOUND" = true ]; then
    if [ -n "$LIBVA_DRIVER_NAME" ]; then
        echo "ℹ️ LIBVA_DRIVER_NAME is set to '$LIBVA_DRIVER_NAME'"
    else
        echo "💡 Consider setting LIBVA_DRIVER_NAME to 'i965' (Intel) or 'radeonsi' (AMD) for VAAPI acceleration"
    fi
fi

if [ "$NVIDIA_FOUND" = true ]; then
    if [ -n "$NVIDIA_VISIBLE_DEVICES" ]; then
        echo "ℹ️ NVIDIA_VISIBLE_DEVICES is set to '$NVIDIA_VISIBLE_DEVICES'"
    else
        echo "💡 Consider setting NVIDIA_VISIBLE_DEVICES to 'all' or specific indices (e.g., '0,1')"
    fi

    if [ -n "$NVIDIA_DRIVER_CAPABILITIES" ]; then
        echo "ℹ️ NVIDIA_DRIVER_CAPABILITIES is set to '$NVIDIA_DRIVER_CAPABILITIES'"
    else
        echo "💡 Consider setting NVIDIA_DRIVER_CAPABILITIES to 'all' or 'compute,video,utility' for full functionality"
    fi

    if [ -n "$CUDA_VISIBLE_DEVICES" ]; then
        echo "ℹ️ CUDA_VISIBLE_DEVICES is set to '$CUDA_VISIBLE_DEVICES'"
    fi
fi

# Check FFmpeg hardware acceleration support
echo "🔍 Checking FFmpeg hardware acceleration capabilities..."
if command -v ffmpeg >/dev/null 2>&1; then
    HWACCEL=$(ffmpeg -hide_banner -hwaccels 2>/dev/null | grep -v "Hardware acceleration methods:" || echo "None found")
    echo "Available FFmpeg hardware acceleration methods:"
    echo "$HWACCEL"
else
    echo "⚠️ FFmpeg not found in PATH."
fi

# Provide a final summary of the hardware acceleration setup
echo "📋 ===================== SUMMARY ====================="

# Identify which GPU type is active and working
if [ "$NVIDIA_FOUND" = true ] && (nvidia-smi >/dev/null 2>&1 || [ -n "$NVIDIA_VISIBLE_DEVICES" ]); then
    echo "🔰 NVIDIA GPU: ACTIVE"
    if [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = true ]; then
        echo "✅ NVIDIA Container Toolkit: CONFIGURED CORRECTLY"
    elif [ -n "$NVIDIA_VISIBLE_DEVICES" ] && [ -n "$NVIDIA_DRIVER_CAPABILITIES" ]; then
        echo "✅ NVIDIA Docker configuration: USING MODERN DEPLOYMENT"
    else
        echo "⚠️ NVIDIA setup method: DIRECT DEVICE MAPPING (functional but not optimal)"
    fi
    # Display FFmpeg NVIDIA acceleration methods
    if echo "$HWACCEL" | grep -q "cuda\|nvenc\|cuvid"; then
        echo "✅ FFmpeg NVIDIA acceleration: AVAILABLE"
    else
        echo "⚠️ FFmpeg NVIDIA acceleration: NOT DETECTED"
    fi
elif [ "$DRI_DEVICES_FOUND" = true ]; then
    # Intel/AMD detection
    if [ -n "$LIBVA_DRIVER_NAME" ]; then
        echo "🔰 ${LIBVA_DRIVER_NAME^^} GPU: ACTIVE"
    else
        echo "🔰 INTEL/AMD GPU: ACTIVE"
    fi

    # Check group membership
    if [ -n "$VIDEO_GID" ] && id -G | grep -qw "$VIDEO_GID"; then
        echo "✅ Video group membership: CORRECT"
    elif [ -n "$RENDER_GID" ] && id -G | grep -qw "$RENDER_GID"; then
        echo "✅ Render group membership: CORRECT"
    else
        echo "⚠️ Group membership: MISSING (may cause permission issues)"
    fi

    # Display FFmpeg VAAPI acceleration method
    if echo "$HWACCEL" | grep -q "vaapi"; then
        echo "✅ FFmpeg VAAPI acceleration: AVAILABLE"
    else
        echo "⚠️ FFmpeg VAAPI acceleration: NOT DETECTED"
    fi
else
    echo "❌ NO GPU ACCELERATION DETECTED"
    echo "⚠️ Hardware acceleration is unavailable or misconfigured"
fi

echo "📋 =================================================="
echo "✅ GPU detection script complete."
