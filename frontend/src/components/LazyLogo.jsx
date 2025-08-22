import React, { useState, useEffect } from 'react';
import { Skeleton } from '@mantine/core';
import useLogosStore from '../store/logos';
import logo from '../images/logo.png'; // Default logo

const LazyLogo = ({
    logoId,
    alt = 'logo',
    style = { maxHeight: 18, maxWidth: 55 },
    fallbackSrc = logo,
    ...props
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const logos = useLogosStore((s) => s.logos);
    const fetchLogosByIds = useLogosStore((s) => s.fetchLogosByIds);

    // Determine the logo source
    const logoData = logoId && logos[logoId];
    const logoSrc = logoData?.cache_url || (logoId ? `/api/channels/logos/${logoId}/cache/` : fallbackSrc);

    useEffect(() => {
        // If we have a logoId but no logo data, try to fetch it
        if (logoId && !logoData && !isLoading && !hasError) {
            setIsLoading(true);
            fetchLogosByIds([logoId])
                .then(() => {
                    setIsLoading(false);
                })
                .catch((error) => {
                    console.warn(`Failed to load logo ${logoId}:`, error);
                    setIsLoading(false);
                    setHasError(true);
                });
        }
    }, [logoId, logoData, fetchLogosByIds, isLoading, hasError]);

    // Show skeleton while loading
    if (isLoading) {
        return (
            <Skeleton
                height={style.maxHeight || 18}
                width={style.maxWidth || 55}
                style={{ ...style, borderRadius: 4 }}
            />
        );
    }

    // Show image (will use fallback if logo fails to load)
    return (
        <img
            src={logoSrc}
            alt={alt}
            style={style}
            onError={(e) => {
                if (!hasError) {
                    setHasError(true);
                    e.target.src = fallbackSrc;
                }
            }}
            {...props}
        />
    );
};

export default LazyLogo;
