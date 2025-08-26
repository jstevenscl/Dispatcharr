import { useState, useEffect, useCallback } from 'react';
import useLogosStore from '../store/logos';

/**
 * Hook for components that need to display all logos (like logo selection popovers)
 * Loads logos on-demand when the component is opened
 */
export const useLogoSelection = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const logos = useLogosStore((s) => s.logos);
  const fetchLogos = useLogosStore((s) => s.fetchLogos); // Check if we have a reasonable number of logos loaded
  const hasEnoughLogos = Object.keys(logos).length > 0;

  const ensureLogosLoaded = useCallback(async () => {
    if (isLoading || (hasEnoughLogos && isInitialized)) {
      return;
    }

    setIsLoading(true);
    try {
      await fetchLogos();
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to load logos for selection:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasEnoughLogos, isInitialized, fetchLogos]);

  return {
    logos,
    isLoading,
    ensureLogosLoaded,
    hasLogos: hasEnoughLogos,
  };
};

/**
 * Hook for channel forms that need only channel-assignable logos
 * (unused + channel-used, excluding VOD-only logos)
 */
export const useChannelLogoSelection = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  const channelLogos = useLogosStore((s) => s.channelLogos);
  const hasLoadedChannelLogos = useLogosStore((s) => s.hasLoadedChannelLogos);
  const backgroundLoading = useLogosStore((s) => s.backgroundLoading); // Use global loading state
  const fetchChannelAssignableLogos = useLogosStore(
    (s) => s.fetchChannelAssignableLogos
  );

  // Check if we have channel-assignable logos loaded
  const hasLogos = Object.keys(channelLogos).length > 0;

  const ensureLogosLoaded = useCallback(async () => {
    // Use global loading state instead of local state
    if (backgroundLoading || (hasLoadedChannelLogos && isInitialized)) {
      return;
    }

    try {
      await fetchChannelAssignableLogos();
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to load channel-assignable logos:', error);
    }
  }, [
    backgroundLoading, // Use global loading state
    hasLoadedChannelLogos,
    isInitialized,
    fetchChannelAssignableLogos,
  ]);

  // Auto-load logos when hook is first used
  useEffect(() => {
    ensureLogosLoaded();
  }, [ensureLogosLoaded]);

  return {
    logos: channelLogos, // Return channelLogos instead of all logos
    isLoading: backgroundLoading, // Use global loading state
    ensureLogosLoaded,
    hasLogos,
  };
};

/**
 * Hook for components that need specific logos by IDs
 */
export const useLogosById = (logoIds = []) => {
  const [isLoading, setIsLoading] = useState(false);

  const logos = useLogosStore((s) => s.logos);
  const fetchLogosByIds = useLogosStore((s) => s.fetchLogosByIds); // Find missing logos
  const missingIds = logoIds.filter((id) => id && !logos[id]);

  useEffect(() => {
    if (missingIds.length > 0 && !isLoading) {
      setIsLoading(true);
      fetchLogosByIds(missingIds)
        .then(() => setIsLoading(false))
        .catch((error) => {
          console.error('Failed to load logos by IDs:', error);
          setIsLoading(false);
        });
    }
  }, [missingIds, isLoading, fetchLogosByIds]);

  return {
    logos,
    isLoading,
    missingLogos: missingIds.length,
  };
};
