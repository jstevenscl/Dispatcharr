import React from 'react';
import { Box } from '@mantine/core';
import UserAgentsTable from '../components/tables/UserAgentsTable';
import EPGsTable from '../components/tables/EPGsTable';

const EPGPage = () => {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        padding: 16,
      }}
    >
      <Box style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <EPGsTable />
      </Box>

      <Box style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <UserAgentsTable />
      </Box>
    </Box>
  );
};

export default EPGPage;
