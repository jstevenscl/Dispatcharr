import React, { useEffect, useCallback } from 'react';
import { Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import useLogosStore from '../store/logos';
import LogosTable from '../components/tables/LogosTable';

const LogosPage = () => {
    const { fetchLogos, logos } = useLogosStore();

    const loadLogos = useCallback(async () => {
        try {
            // Only fetch all logos if we don't have any yet
            if (Object.keys(logos).length === 0) {
                await fetchLogos();
            }
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: 'Failed to load logos',
                color: 'red',
            });
            console.error('Failed to load logos:', err);
        }
    }, [fetchLogos, logos]);

    useEffect(() => {
        loadLogos();
    }, [loadLogos]);

    return (
        <Box style={{ padding: 10 }}>
            <LogosTable />
        </Box>
    );
};

export default LogosPage;
