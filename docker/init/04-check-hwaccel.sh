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

# Initialize device detection flags
ANY_GPU_DEVICES_FOUND=false
DRI_DEVICES_FOUND=false
NVIDIA_FOUND=false
NVIDIA_GPU_IN_LSPCI=false
INTEL_GPU_IN_LSPCI=false
AMD_GPU_IN_LSPCI=false

# Check for all GPU types in hardware via lspci
if command -v lspci >/dev/null 2>&1; then
    # Check for NVIDIA GPUs
    if lspci | grep -i "NVIDIA" | grep -i "VGA\|3D\|Display" >/dev/null; then
        NVIDIA_GPU_IN_LSPCI=true
        NVIDIA_MODEL=$(lspci | grep -i "NVIDIA" | grep -i "VGA\|3D\|Display" | head -1 | sed -E 's/.*: (.*) \[.*/\1/' | sed 's/Corporation //')
    fi

    # Check for Intel GPUs - making sure it's not already detected as NVIDIA
    if lspci | grep -i "Intel" | grep -v "NVIDIA" | grep -i "VGA\|3D\|Display" >/dev/null; then
        INTEL_GPU_IN_LSPCI=true
        INTEL_MODEL=$(lspci | grep -i "Intel" | grep -v "NVIDIA" | grep -i "VGA\|3D\|Display" | head -1 | sed -E 's/.*: (.*) \[.*/\1/' | sed 's/Corporation //')
    fi

    # Check for AMD GPUs - making sure it's not already detected as NVIDIA or Intel
    if lspci | grep -i "AMD\|ATI\|Advanced Micro Devices" | grep -v "NVIDIA\|Intel" | grep -i "VGA\|3D\|Display" >/dev/null; then
        AMD_GPU_IN_LSPCI=true
        AMD_MODEL=$(lspci | grep -i "AMD\|ATI\|Advanced Micro Devices" | grep -v "NVIDIA\|Intel" | grep -i "VGA\|3D\|Display" | head -1 | sed -E 's/.*: (.*) \[.*/\1/' | sed 's/Corporation //' | sed 's/Technologies //')
    fi

    # Display detected GPU hardware
    if [ "$NVIDIA_GPU_IN_LSPCI" = true ]; then
        echo "🔍 Hardware detection: NVIDIA GPU ($NVIDIA_MODEL)"
    fi
    if [ "$INTEL_GPU_IN_LSPCI" = true ]; then
        echo "🔍 Hardware detection: Intel GPU ($INTEL_MODEL)"
    fi
    if [ "$AMD_GPU_IN_LSPCI" = true ]; then
        echo "🔍 Hardware detection: AMD GPU ($AMD_MODEL)"
    fi
fi

# Silently check for any GPU devices first
for dev in /dev/dri/renderD* /dev/dri/card* /dev/nvidia*; do
    if [ -e "$dev" ]; then
        ANY_GPU_DEVICES_FOUND=true
        break
    fi
done

# Only if devices might exist, show detailed checks
if [ "$ANY_GPU_DEVICES_FOUND" = true ]; then
    # Check Intel/AMD VAAPI devices
    echo "🔍 Checking for VAAPI device nodes (Intel/AMD)..."
    for dev in /dev/dri/renderD* /dev/dri/card*; do
        if [ -e "$dev" ]; then
            DRI_DEVICES_FOUND=true
            check_dev "$dev"
        fi
    done

    # Check NVIDIA device nodes
    echo "🔍 Checking for NVIDIA device nodes..."
    for dev in /dev/nvidia*; do
        if [ -e "$dev" ]; then
            NVIDIA_FOUND=true
            check_dev "$dev"
        fi
    done

    # Show GPU device availability messages
    if [ "$NVIDIA_FOUND" = false ] && [ "$NVIDIA_GPU_IN_LSPCI" = true ]; then
        echo "⚠️ No NVIDIA device nodes available despite hardware detection."
        echo "   You may be able to use VAAPI for hardware acceleration, but NVENC/CUDA won't be available."
        echo "   For optimal performance, configure proper NVIDIA container runtime."
    elif [ "$NVIDIA_FOUND" = false ]; then
        echo "ℹ️ No NVIDIA device nodes found under /dev."
    fi

    # Check for Intel/AMD GPUs that might not be fully accessible
    if [ "$DRI_DEVICES_FOUND" = false ] && [ "$INTEL_GPU_IN_LSPCI" = true ]; then
        echo "⚠️ Intel GPU detected in hardware but no DRI devices found."
        echo "   Hardware acceleration will not be available."
        echo "   Make sure /dev/dri/ devices are properly mapped to the container."
    elif [ "$DRI_DEVICES_FOUND" = false ] && [ "$AMD_GPU_IN_LSPCI" = true ]; then
        echo "⚠️ AMD GPU detected in hardware but no DRI devices found."
        echo "   Hardware acceleration will not be available."
        echo "   Make sure /dev/dri/ devices are properly mapped to the container."
    fi
else
    # No GPU devices found, skip the detailed checks
    echo "❌ No GPU acceleration devices detected in this container."
    echo "ℹ️ Checking for potential configuration issues..."

    # Check if the host might have GPUs that aren't passed to the container
    if command -v lspci >/dev/null 2>&1; then
        if lspci | grep -i "VGA\|3D\|Display" | grep -i "NVIDIA\|Intel\|AMD" >/dev/null; then
            echo "⚠️ Host system appears to have GPU hardware, but no devices are accessible to the container."
            echo "   - For NVIDIA GPUs: Ensure NVIDIA Container Runtime is configured properly"
            echo "   - For Intel/AMD GPUs: Verify that /dev/dri/ devices are passed to the container"
            echo "   - Check your Docker run command or docker-compose.yml for proper device mapping"
        else
            echo "ℹ️ No GPU hardware detected on the host system. CPU-only transcoding will be used."
        fi
    else
        echo "ℹ️ Unable to check host GPU hardware (lspci not available). CPU-only transcoding will be used."
    fi

    echo "📋 =================================================="
    echo "✅ GPU detection script complete. No GPUs available for hardware acceleration."
    exit 0
fi

# Check group membership for GPU access - context-aware based on hardware
echo "🔍 Checking user group memberships and device access..."
VIDEO_GID=$(getent group video | cut -d: -f3)
RENDER_GID=$(getent group render | cut -d: -f3)
NVIDIA_CONTAINER_TOOLKIT_FOUND=false
NVIDIA_ENV_MISMATCH=false

# Improved device access check function
check_user_device_access() {
    local device=$1
    local user=$2
    if [ -e "$device" ]; then
        if su -c "test -r $device && test -w $device" - $user 2>/dev/null; then
            echo "✅ User $user has full access to $device"
            return 0
        else
            echo "⚠️ User $user cannot access $device (permission denied)"
            return 1
        fi
    else
        # Device doesn't exist, no need to report here
        return 2
    fi
}

# Direct device access verification for DRI (Intel/AMD)
echo "🔍 Verifying if $POSTGRES_USER has direct access to GPU devices..."
HAS_DRI_ACCESS=false
DRI_ACCESS_COUNT=0
DRI_DEVICE_COUNT=0

for dev in /dev/dri/renderD* /dev/dri/card*; do
    if [ -e "$dev" ]; then
        DRI_DEVICE_COUNT=$((DRI_DEVICE_COUNT + 1))
        if check_user_device_access "$dev" "$POSTGRES_USER"; then
            DRI_ACCESS_COUNT=$((DRI_ACCESS_COUNT + 1))
            HAS_DRI_ACCESS=true
        fi
    fi
done

# Direct device access verification for NVIDIA
HAS_NVIDIA_ACCESS=false
NVIDIA_ACCESS_COUNT=0
NVIDIA_DEVICE_COUNT=0

for dev in /dev/nvidia*; do
    if [ -e "$dev" ]; then
        NVIDIA_DEVICE_COUNT=$((NVIDIA_DEVICE_COUNT + 1))
        if check_user_device_access "$dev" "$POSTGRES_USER"; then
            NVIDIA_ACCESS_COUNT=$((NVIDIA_ACCESS_COUNT + 1))
            HAS_NVIDIA_ACCESS=true
        fi
    fi
done

# Summary of device access
if [ $DRI_DEVICE_COUNT -gt 0 ]; then
    if [ $DRI_ACCESS_COUNT -eq $DRI_DEVICE_COUNT ]; then
        echo "✅ User $POSTGRES_USER has access to all DRI devices ($DRI_ACCESS_COUNT/$DRI_DEVICE_COUNT)"
        echo "   VAAPI hardware acceleration should work properly."
    else
        echo "⚠️ User $POSTGRES_USER has limited access to DRI devices ($DRI_ACCESS_COUNT/$DRI_DEVICE_COUNT)"
        echo "   VAAPI hardware acceleration may not work properly."
        echo "   Consider adding $POSTGRES_USER to the 'video' and/or 'render' groups."
    fi
fi

if [ $NVIDIA_DEVICE_COUNT -gt 0 ]; then
    if [ $NVIDIA_ACCESS_COUNT -eq $NVIDIA_DEVICE_COUNT ]; then
        echo "✅ User $POSTGRES_USER has access to all NVIDIA devices ($NVIDIA_ACCESS_COUNT/$NVIDIA_DEVICE_COUNT)"
        echo "   NVIDIA hardware acceleration should work properly."
    else
        echo "⚠️ User $POSTGRES_USER has limited access to NVIDIA devices ($NVIDIA_ACCESS_COUNT/$NVIDIA_DEVICE_COUNT)"
        echo "   NVIDIA hardware acceleration may not work properly."
        if [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = false ]; then
            echo "   Consider adding $POSTGRES_USER to the 'video' group or use NVIDIA Container Toolkit."
        fi
    fi
fi

# Check for traditional group memberships (as additional information)
USER_IN_VIDEO_GROUP=false
USER_IN_RENDER_GROUP=false

if [ -n "$VIDEO_GID" ]; then
    if id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "video"; then
        USER_IN_VIDEO_GROUP=true
        echo "ℹ️ User $POSTGRES_USER is in the 'video' group (GID $VIDEO_GID)."
    fi
fi

if [ -n "$RENDER_GID" ]; then
    if id -nG "$POSTGRES_USER" 2>/dev/null | grep -qw "render"; then
        USER_IN_RENDER_GROUP=true
        echo "ℹ️ User $POSTGRES_USER is in the 'render' group (GID $RENDER_GID)."
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

# Removed duplicate video group checks here - consolidated into the earlier checks that include GID

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

# Final verdict based on hardware AND runtime with improved messaging
if [ "$NVIDIA_FOUND" = true ] && ([ "$NVIDIA_RUNTIME_ACTIVE" = true ] || [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = true ]); then
    echo "✅ NVIDIA Container Runtime is properly configured with hardware access."
elif [ "$NVIDIA_FOUND" = true ] && [ "$NVIDIA_RUNTIME_ACTIVE" = false ] && [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = false ]; then
    echo "ℹ️ NVIDIA devices accessible via direct passthrough instead of Container Runtime."
    echo "   This works but consider using the 'deploy: resources: reservations: devices:' method in docker-compose."
elif [ "$NVIDIA_FOUND" = false ] && [ "$NVIDIA_RUNTIME_ACTIVE" = true ]; then
    echo "⚠️ NVIDIA Container Runtime appears to be configured, but no NVIDIA devices found."
    echo "   Check that your host has NVIDIA drivers installed and GPUs are properly passed to the container."
elif [ "$DRI_DEVICES_FOUND" = true ] && [ "$NVIDIA_GPU_IN_LSPCI" = true ]; then
    echo "ℹ️ Limited GPU access: Only DRI devices available for NVIDIA hardware."
    echo "   VAAPI acceleration may work but NVENC/CUDA won't be available."
    echo "   For full NVIDIA capabilities, configure the NVIDIA Container Runtime."
elif [ "$DRI_DEVICES_FOUND" = true ]; then
    echo "ℹ️ Using Intel/AMD GPU hardware for acceleration via VAAPI."
else
    echo "⚠️ No GPU acceleration devices detected. CPU-only transcoding will be used."
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
    # Detect Intel/AMD GPU model - skip this if we already detected GPUs earlier
    if [ "$NVIDIA_GPU_IN_LSPCI" = false ] && [ "$INTEL_GPU_IN_LSPCI" = false ] && [ "$AMD_GPU_IN_LSPCI" = false ] && command -v lspci >/dev/null 2>&1; then
        GPU_INFO=$(lspci -nn | grep -i "VGA\|Display" | head -1)
        if [ -n "$GPU_INFO" ]; then
            echo "🔍 Detected GPU: $GPU_INFO"
            # Extract model for cleaner display in summary
            GPU_MODEL=$(echo "$GPU_INFO" | sed -E 's/.*: (.*) \[.*/\1/' | sed 's/Corporation //' | sed 's/Technologies //')
        fi
    else
        # Use already detected GPU model info
        if [ "$NVIDIA_GPU_IN_LSPCI" = true ]; then
            GPU_MODEL=$NVIDIA_MODEL
        elif [ "$INTEL_GPU_IN_LSPCI" = true ]; then
            GPU_MODEL=$INTEL_MODEL
        elif [ "$AMD_GPU_IN_LSPCI" = true ]; then
            GPU_MODEL=$AMD_MODEL
        fi
    fi

    if [ -n "$LIBVA_DRIVER_NAME" ]; then
        echo "ℹ️ LIBVA_DRIVER_NAME is set to '$LIBVA_DRIVER_NAME'"
    else
        # Check if we can detect the GPU type
        if command -v lspci >/dev/null 2>&1; then
            echo "ℹ️ VAAPI driver auto-detection is usually reliable. Settings below only needed if you experience issues."

            # Intel GPU detection with more future-proof approach
            if lspci | grep -q "Intel Corporation.*VGA"; then
                # Check for newer Intel generations that use iHD
                if lspci | grep -E "Intel Corporation.*VGA" | grep -E "Arc|Xe|Alchemist|Tiger Lake|Alder Lake|Raptor Lake|Meteor Lake|Gen1[2-9]"; then
                    echo "💡 If needed: LIBVA_DRIVER_NAME=iHD for modern Intel GPUs (Gen12+/Arc/Xe)"
                # Check for very old Intel that definitely needs i965
                elif lspci | grep -E "Intel Corporation.*VGA" | grep -E "Haswell|Broadwell|Skylake|Kaby Lake|Coffee Lake|Whiskey Lake|Comet Lake"; then
                    echo "💡 If needed: LIBVA_DRIVER_NAME=i965 for older Intel GPUs (Gen11 and below)"
                else
                    # Generic Intel case - could be either, but iHD is more likely for newer hardware
                    echo "💡 If needed: Try LIBVA_DRIVER_NAME=iHD first, or LIBVA_DRIVER_NAME=i965 if that fails"
                fi
            elif lspci | grep -q "Advanced Micro Devices.*VGA"; then
                echo "💡 If needed: LIBVA_DRIVER_NAME=radeonsi for AMD GPUs"
            else
                echo "ℹ️ Common VAAPI driver options if auto-detection fails:"
                echo "   - For modern Intel GPUs (Gen12+/Arc/Xe): LIBVA_DRIVER_NAME=iHD"
                echo "   - For older Intel GPUs: LIBVA_DRIVER_NAME=i965"
                echo "   - For AMD GPUs: LIBVA_DRIVER_NAME=radeonsi"
            fi
        else
            echo "ℹ️ Intel/AMD GPU detected. Auto-detection should work in most cases."
            echo "   If VAAPI doesn't work, you may need to set LIBVA_DRIVER_NAME manually."
        fi
    fi
fi

# Check FFmpeg hardware acceleration support
echo "🔍 Checking FFmpeg hardware acceleration capabilities..."
if command -v ffmpeg >/dev/null 2>&1; then
    HWACCEL=$(ffmpeg -hide_banner -hwaccels 2>/dev/null | grep -v "Hardware acceleration methods:" || echo "None found")

    # Define expected acceleration methods based on detected hardware
    EXPECTED_METHODS=""
    MISSING_METHODS=""

    if [ "$NVIDIA_FOUND" = true ]; then
        EXPECTED_NVIDIA="cuda" #cuvid nvenc nvdec" keeping these in case future support is added
        for method in $EXPECTED_NVIDIA; do
            if echo "$HWACCEL" | grep -q "$method"; then
                EXPECTED_METHODS="$EXPECTED_METHODS $method"
            else
                MISSING_METHODS="$MISSING_METHODS $method"
            fi
        done
    fi

    if [ "$INTEL_GPU_IN_LSPCI" = true ] && [ "$DRI_DEVICES_FOUND" = true ]; then
        EXPECTED_INTEL="vaapi qsv"
        for method in $EXPECTED_INTEL; do
            if echo "$HWACCEL" | grep -q "$method"; then
                EXPECTED_METHODS="$EXPECTED_METHODS $method"
            else
                MISSING_METHODS="$MISSING_METHODS $method"
            fi
        done
    fi

    if [ "$AMD_GPU_IN_LSPCI" = true ] && [ "$DRI_DEVICES_FOUND" = true ]; then
        EXPECTED_AMD="vaapi"
        for method in $EXPECTED_AMD; do
            if echo "$HWACCEL" | grep -q "$method"; then
                EXPECTED_METHODS="$EXPECTED_METHODS $method"
            else
                MISSING_METHODS="$MISSING_METHODS $method"
            fi
        done
    fi

    # Show all available methods
    echo "🔍 All available FFmpeg hardware acceleration methods:"
    echo "$HWACCEL"

    # Show expected methods based on hardware
    if [ -n "$EXPECTED_METHODS" ]; then
        echo "✅ Hardware-appropriate acceleration methods available:$EXPECTED_METHODS"
    fi

    # Show missing expected methods
    if [ -n "$MISSING_METHODS" ]; then
        echo "⚠️ Expected acceleration methods not found:$MISSING_METHODS"
        echo "   This might indicate missing libraries or improper driver configuration."
    fi

    # Check specific cases of interest
    if [ "$NVIDIA_FOUND" = true ] && ! echo "$HWACCEL" | grep -q "cuda\|nvenc\|cuvid"; then
        echo "⚠️ NVIDIA GPU detected but no NVIDIA acceleration methods available."
        echo "   Ensure ffmpeg is built with NVIDIA support and required libraries are installed."
    fi

    if ([ "$INTEL_GPU_IN_LSPCI" = true ] || [ "$AMD_GPU_IN_LSPCI" = true ]) && [ "$DRI_DEVICES_FOUND" = true ] && ! echo "$HWACCEL" | grep -q "vaapi"; then
        echo "⚠️ Intel/AMD GPU detected but VAAPI acceleration not available."
        echo "   Ensure ffmpeg is built with VAAPI support and proper drivers are installed."
    fi
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
        echo "🔰 NVIDIA GPU: ACTIVE (model detection unavailable)"
        echo "ℹ️ Note: GPU model information couldn't be retrieved, but devices are present."
        echo "   This may be due to missing nvidia-smi tool or container limitations."
    fi

    if [ "$NVIDIA_CONTAINER_TOOLKIT_FOUND" = true ]; then
        echo "✅ NVIDIA Container Toolkit: CONFIGURED CORRECTLY"
    elif [ -n "$NVIDIA_VISIBLE_DEVICES" ] && [ -n "$NVIDIA_DRIVER_CAPABILITIES" ]; then
        echo "✅ NVIDIA Docker configuration: USING MODERN DEPLOYMENT"
    else
        echo "⚠️ NVIDIA setup method: DIRECT DEVICE MAPPING (functional but not optimal)"
    fi

    # Add device accessibility status
    if [ $NVIDIA_DEVICE_COUNT -gt 0 ]; then
        if [ $NVIDIA_ACCESS_COUNT -eq $NVIDIA_DEVICE_COUNT ]; then
            echo "✅ Device access: ALL NVIDIA DEVICES ACCESSIBLE ($NVIDIA_ACCESS_COUNT/$NVIDIA_DEVICE_COUNT)"
        else
            echo "⚠️ Device access: LIMITED NVIDIA DEVICE ACCESS ($NVIDIA_ACCESS_COUNT/$NVIDIA_DEVICE_COUNT)"
            echo "   Some hardware acceleration features may not work properly."
        fi
    fi

    # Display FFmpeg NVIDIA acceleration methods
    if echo "$HWACCEL" | grep -q "cuda\|nvenc\|cuvid"; then
        echo "✅ FFmpeg NVIDIA acceleration: AVAILABLE"
    else
        echo "⚠️ FFmpeg NVIDIA acceleration: NOT DETECTED"
    fi
elif [ "$NVIDIA_GPU_IN_LSPCI" = true ] && [ "$DRI_DEVICES_FOUND" = true ]; then
    # NVIDIA through DRI only (suboptimal but possible)
    if [ -n "$NVIDIA_MODEL" ]; then
        echo "🔰 NVIDIA GPU: $NVIDIA_MODEL (SUBOPTIMALLY CONFIGURED)"
    else
        echo "🔰 NVIDIA GPU: DETECTED BUT SUBOPTIMALLY CONFIGURED"
    fi
    echo "⚠️ Your NVIDIA GPU is only accessible through DRI devices"
    echo "   - VAAPI acceleration may work for some tasks"
    echo "   - NVENC/CUDA acceleration is NOT available"

    # Add device accessibility status
    if [ $DRI_DEVICE_COUNT -gt 0 ]; then
        if [ $DRI_ACCESS_COUNT -eq $DRI_DEVICE_COUNT ]; then
            echo "✅ Device access: ALL DRI DEVICES ACCESSIBLE ($DRI_ACCESS_COUNT/$DRI_DEVICE_COUNT)"
            echo "   VAAPI acceleration should work properly."
        else
            echo "⚠️ Device access: LIMITED DRI DEVICE ACCESS ($DRI_ACCESS_COUNT/$DRI_DEVICE_COUNT)"
            echo "   VAAPI acceleration may not work properly."
        fi
    fi

    echo "💡 RECOMMENDATION: Use the proper NVIDIA container configuration:"
    echo "    deploy:"
    echo "      resources:"
    echo "        reservations:"
    echo "          devices:"
    echo "            - driver: nvidia"
    echo "              count: all"
    echo "              capabilities: [gpu]"

    if echo "$HWACCEL" | grep -q "vaapi"; then
        echo "✅ FFmpeg VAAPI acceleration: AVAILABLE"
    else
        echo "⚠️ FFmpeg VAAPI acceleration: NOT DETECTED"
    fi
elif [ "$DRI_DEVICES_FOUND" = true ]; then
    # Intel/AMD detection with model if available
    if [ -n "$GPU_MODEL" ]; then
        echo "🔰 GPU: $GPU_MODEL"
    elif [ -n "$LIBVA_DRIVER_NAME" ]; then
        echo "🔰 ${LIBVA_DRIVER_NAME^^} GPU: ACTIVE"
    else
        echo "🔰 INTEL/AMD GPU: ACTIVE (model detection unavailable)"
        echo "ℹ️ Note: Basic GPU drivers appear to be loaded (device nodes exist), but"
        echo "   couldn't identify specific model. This doesn't necessarily indicate a problem."
    fi

    # Add device accessibility status
    if [ $DRI_DEVICE_COUNT -gt 0 ]; then
        if [ $DRI_ACCESS_COUNT -eq $DRI_DEVICE_COUNT ]; then
            echo "✅ Device access: ALL DRI DEVICES ACCESSIBLE ($DRI_ACCESS_COUNT/$DRI_DEVICE_COUNT)"
            echo "   VAAPI hardware acceleration should work properly."
        else
            echo "⚠️ Device access: LIMITED DRI DEVICE ACCESS ($DRI_ACCESS_COUNT/$DRI_DEVICE_COUNT)"
            echo "   VAAPI hardware acceleration may not work properly."
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
