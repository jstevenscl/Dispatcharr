import React from 'react';
import StreamProfilesTable from '../components/tables/StreamProfilesTable';
import { Box } from '@mantine/core';

const StreamProfilesPage = () => {
  return (
    <Box style={{ padding: 16 }}>
      <StreamProfilesTable />
    </Box>
  );
};

export default StreamProfilesPage;
