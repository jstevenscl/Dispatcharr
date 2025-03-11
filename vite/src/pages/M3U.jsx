import React, { useState } from 'react';
import useUserAgentsStore from '../store/userAgents';
import M3UsTable from '../components/tables/M3UsTable';
import UserAgentsTable from '../components/tables/UserAgentsTable';
import { Box } from '@mantine/core';

const M3UPage = () => {
  const isLoading = useUserAgentsStore((state) => state.isLoading);
  const error = useUserAgentsStore((state) => state.error);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <M3UsTable />
      </Box>

      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <UserAgentsTable />
      </Box>
    </Box>
  );
};

export default M3UPage;
