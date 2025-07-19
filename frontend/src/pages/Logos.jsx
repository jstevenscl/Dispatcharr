import React, { useEffect } from 'react';
import { Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import useChannelsStore from '../store/channels';
import LogosTable from '../components/tables/LogosTable';

const LogosPage = () => {
    const { fetchLogos } = useChannelsStore();

    useEffect(() => {
        loadLogos();
    }, []);

    const loadLogos = async () => {
        try {
            await fetchLogos();
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to load logos',
                color: 'red',
            });
        }
    };

    return (
        <Box style={{ padding: 10 }}>
            <LogosTable />
        </Box>
    );
};

export default LogosPage;
