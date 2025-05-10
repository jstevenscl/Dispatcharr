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
NVIDIA_ENV_MISMATCH=false

# Detect GPU type for smarter group membership requirements
INTEL_GPU_DETECTED=false
AMD_GPU_DETECTED=false
if command -v lspci >/dev/null 2>&1; then
    if lspci | grep -q "Intel Corporation.*VGA"; then
        INTEL_GPU_DETECTED=true
        echo "ℹ️ Intel GPU detected - video group membership is recommended."
    elif lspci | grep -q "Advanced Micro Devices.*VGA"; then
        AMD_GPU_DETECTED=true
        echo "ℹ️ AMD GPU detected - render group membership is recommended."
    fi
fi

# Explicitly check if $POSTGRES_USER is in the video/render groups based on detected hardware
echo "🔍 Verifying if $POSTGRES_USER user is in required groups..."
USER_IN_VIDEO_GROUP=false
USER_IN_RENDER_GROUP=false

# For Intel GPUs or when GPU type can't be determined, check video group
if [ -n "$VIDEO_GID" ]; then
    if id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "video"; then
        USER_IN_VIDEO_GROUP=true
        echo "✅ User $POSTGRES_USER is in the 'video' group."
    elif [ "$INTEL_GPU_DETECTED" = true ] || ([ "$NVIDIA_FOUND" = false ] && [ "$DRI_DEVICES_FOUND" = true ]); then
        echo "⚠️ User $POSTGRES_USER is NOT in the 'video' group - hardware acceleration for Intel GPUs may not work!"
    else
        echo "ℹ️ User $POSTGRES_USER is not in the 'video' group - this is fine for NVIDIA GPUs with container toolkit."
    fi
fi

# For AMD GPUs, check render group
if [ -n "$RENDER_GID" ]; then
    if id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "render"; then
        USER_IN_RENDER_GROUP=true
        echo "✅ User $POSTGRES_USER is in the 'render' group."
    elif [ "$AMD_GPU_DETECTED" = true ]; then
        echo "⚠️ User $POSTGRES_USER is NOT in the 'render' group - hardware acceleration for AMD GPUs may not work!"
    else
        echo "ℹ️ User $POSTGRES_USER is not in the 'render' group - not needed for Intel/NVIDIA GPUs."
    fi
fi

# Check if NVIDIA Container Toolkit is present through environment or CLI tool
# IMPORTANT: Only mark as found if both env vars AND actual NVIDIA devices exist
if [ "$NVIDIA_FOUND" = true ] && command -v nvidia-container-cli >/dev/null 2>&1; then
    NVIDIA_CONTAINER_TOOLKIT_FOUND=true
# Check for environment variables set by NVIDIA Container Runtime, but only if NVIDIA hardware exists
elif [ "$NVIDIA_FOUND" = true ] && [ -n "$NVIDIA_VISIBLE_DEVICES" ] && [ -n "$NVIDIA_DRIVER_CAPABILITIES" ]; then
    NVIDIA_CONTAINER_TOOLKIT_FOUND=true
    echo "✅ NVIDIA Container Toolkit detected (via environment variables)."
    echo "   The container is properly configured with Docker Compose's 'driver: nvidia' syntax."
elif [ -n "$NVIDIA_VISIBLE_DEVICES" ] && [ -n "$NVIDIA_DRIVER_CAPABILITIES" ] && [ "$NVIDIA_FOUND" = false ]; then
    NVIDIA_ENV_MISMATCH=true
fi

# For NVIDIA GPUs with Container Toolkit, video group is optional
if [ "$NVIDIA_FOUND" = true ] && [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = true ]; then
    if [ -n "$VIDEO_GID" ] && id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "video"; then
        echo "✅ User $POSTGRES_USER is in the 'video' group (GID $VIDEO_GID)."
        echo "   Note: With NVIDIA Container Toolkit properly configured, this is usually not required."
    elif [ -n "$VIDEO_GID" ]; then
        echo "ℹ️ User $POSTGRES_USER is not in the 'video' group, but NVIDIA Container Toolkit is present."
        echo "   This is typically fine as the Container Toolkit handles device permissions."
    fi
# For other GPU types (or NVIDIA without Toolkit), video/render group is important
else
    if [ -n "$VIDEO_GID" ]; then
        if id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "video"; then
            echo "✅ User $POSTGRES_USER is in the 'video' group (GID $VIDEO_GID)."
        else
            echo "⚠️ User $POSTGRES_USER is NOT in the 'video' group (GID $VIDEO_GID). Hardware acceleration may not work."
        fi
    elif [ -n "$RENDER_GID" ]; then
        if id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "render"; then
            echo "✅ User $POSTGRES_USER is in the 'render' group (GID $RENDER_GID)."
        else
            echo "⚠️ User $POSTGRES_USER is NOT in the 'render' group (GID $RENDER_GID). Hardware acceleration may not work."
        fi
    else
        echo "⚠️ Neither 'video' nor 'render' groups found on this system."
    fi
fi

# Check NVIDIA Container Toolkit support
echo "🔍 Checking NVIDIA container runtime support..."

# More reliable detection of NVIDIA Container Runtime
NVIDIA_RUNTIME_ACTIVE=false

# Method 1: Check for nvidia-container-cli tool
if command -v nvidia-container-cli >/dev/null 2>&1; then
    NVIDIA_RUNTIME_ACTIVE=true
    echo "✅ NVIDIA Container Runtime detected (nvidia-container-cli found)."

    if nvidia-container-cli info >/dev/null 2>&1; then
        echo "✅ NVIDIA container runtime is functional."
    else
        echo "⚠️ nvidia-container-cli found, but 'info' command failed. Runtime may be misconfigured."
    fi
fi

# Method 2: Check for NVIDIA Container Runtime specific files
if [ -e "/dev/.nv" ] || [ -e "/.nv" ] || [ -e "/.nvidia-container-runtime" ]; then
    NVIDIA_RUNTIME_ACTIVE=true
    echo "✅ NVIDIA Container Runtime files detected."
fi

# Method 3: Check cgroup information for NVIDIA
if grep -q "nvidia" /proc/self/cgroup 2>/dev/null; then
    NVIDIA_RUNTIME_ACTIVE=true
    echo "✅ NVIDIA Container Runtime cgroups detected."
fi

# Final verdict based on hardware AND runtime
if [ "$NVIDIA_FOUND" = true ] && [ "$NVIDIA_RUNTIME_ACTIVE" = true ]; then
    echo "✅ NVIDIA Container Runtime is properly configured with hardware access."
elif [ "$NVIDIA_FOUND" = true ] && [ "$NVIDIA_RUNTIME_ACTIVE" = false ]; then
    echo "ℹ️ NVIDIA GPU detected, but using direct device passthrough instead of Container Runtime."
    echo "   This works but consider using the 'deploy: resources: reservations: devices:' method in docker-compose."
elif [ "$NVIDIA_FOUND" = false ] && [ "$NVIDIA_RUNTIME_ACTIVE" = true ]; then
    echo "⚠️ NVIDIA Container Runtime appears to be configured, but no NVIDIA devices found."
    echo "   Check that your host has NVIDIA drivers installed and GPUs are properly passed to the container."
else
    # No need to show NVIDIA environment variable warnings if they're default in the container
    echo "ℹ️ Using Intel/AMD GPU hardware for acceleration."
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
    # Detect Intel/AMD GPU model
    if command -v lspci >/dev/null 2>&1; then
        GPU_INFO=$(lspci -nn | grep -i "VGA\|Display" | head -1)
        if [ -n "$GPU_INFO" ]; then
            echo "🔍 Detected GPU: $GPU_INFO"
            # Extract model for cleaner display in summary
            GPU_MODEL=$(echo "$GPU_INFO" | sed -E 's/.*: (.*) \[.*/\1/' | sed 's/Corporation //' | sed 's/Technologies //')
        fi
    fi

    if [ -n "$LIBVA_DRIVER_NAME" ]; then
        echo "ℹ️ LIBVA_DRIVER_NAME is set to '$LIBVA_DRIVER_NAME'"
    else
        # Check if we can detect the GPU type
        if command -v lspci >/dev/null 2>&1; then
            if lspci | grep -q "Intel Corporation.*VGA" | grep -i "HD Graphics"; then
                # Newer Intel GPUs (Gen12+/Tiger Lake and newer)
                if lspci | grep -q "Intel Corporation.*VGA" | grep -E "Xe|Alchemist|Tiger Lake|Gen1[2-9]"; then
                    echo "💡 Consider setting LIBVA_DRIVER_NAME=iHD for this modern Intel GPU"
                else
                    # Older Intel GPUs
                    echo "💡 Consider setting LIBVA_DRIVER_NAME=i965 for this Intel GPU"
                fi
            elif lspci | grep -q "Advanced Micro Devices.*VGA"; then
                echo "💡 Consider setting LIBVA_DRIVER_NAME=radeonsi for this AMD GPU"
            else
                echo "ℹ️ Auto-detection of VAAPI driver is usually reliable, but if you have issues:"
                echo "   - For newer Intel GPUs: LIBVA_DRIVER_NAME=iHD"
                echo "   - For older Intel GPUs: LIBVA_DRIVER_NAME=i965"
                echo "   - For AMD GPUs: LIBVA_DRIVER_NAME=radeonsi"
            fi
        else
            echo "ℹ️ Intel/AMD GPU detected. If VAAPI doesn't work automatically, you may need to set LIBVA_DRIVER_NAME"
            echo "   based on your specific hardware (iHD for newer Intel, i965 for older Intel, radeonsi for AMD)"
        fi
    fi
fi

if [ "$NVIDIA_FOUND" = true ]; then
    # Try to get NVIDIA GPU model info
    if command -v nvidia-smi >/dev/null 2>&1; then
        NVIDIA_MODEL=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        if [ -n "$NVIDIA_MODEL" ]; then
            echo "🔍 Detected NVIDIA GPU: $NVIDIA_MODEL"
            GPU_MODEL=$NVIDIA_MODEL
        fi
    fi

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
    if [ -n "$NVIDIA_MODEL" ]; then
        echo "🔰 NVIDIA GPU: $NVIDIA_MODEL"
    else
        echo "🔰 NVIDIA GPU: ACTIVE"
    fi

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
    # Intel/AMD detection with model if available
    if [ -n "$GPU_MODEL" ]; then
        echo "🔰 GPU: $GPU_MODEL"
    elif [ -n "$LIBVA_DRIVER_NAME" ]; then
        echo "🔰 ${LIBVA_DRIVER_NAME^^} GPU: ACTIVE"
    else
        echo "🔰 INTEL/AMD GPU: ACTIVE"
    fi

    # Check group membership based on detected GPU type
    if [ "$INTEL_GPU_DETECTED" = true ]; then
        if [ "$USER_IN_VIDEO_GROUP" = true ]; then
            echo "✅ Video group membership for $POSTGRES_USER: CORRECT (required for Intel GPU)"
        else
            echo "⚠️ Video group membership for $POSTGRES_USER: MISSING (required for Intel GPU)"
        fi
    elif [ "$AMD_GPU_DETECTED" = true ]; then
        if [ "$USER_IN_RENDER_GROUP" = true ]; then
            echo "✅ Render group membership for $POSTGRES_USER: CORRECT (required for AMD GPU)"
        else
            echo "⚠️ Render group membership for $POSTGRES_USER: MISSING (required for AMD GPU)"
        fi
    elif [ "$NVIDIA_FOUND" = true ] && [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = false ]; then
        # For NVIDIA without container toolkit, check video group
        if [ "$USER_IN_VIDEO_GROUP" = true ]; then
            echo "✅ Video group membership for $POSTGRES_USER: CORRECT (helps with direct NVIDIA device access)"
        else
            echo "⚠️ Video group membership for $POSTGRES_USER: MISSING (may affect direct NVIDIA device access)"
        fi
    else
        # Generic case or NVIDIA with container toolkit (where group membership is less important)
        if [ "$USER_IN_VIDEO_GROUP" = true ] || [ "$USER_IN_RENDER_GROUP" = true ]; then
            echo "✅ GPU group membership for $POSTGRES_USER: CORRECT"
        else
            echo "ℹ️ GPU group membership for $POSTGRES_USER: NOT REQUIRED (using NVIDIA Container Toolkit)"
        fi
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
