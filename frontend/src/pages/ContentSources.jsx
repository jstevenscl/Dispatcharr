import React, { useState } from 'react';
import useUserAgentsStore from '../store/userAgents';
import M3UsTable from '../components/tables/M3UsTable';
import EPGsTable from '../components/tables/EPGsTable';
import { Box, Stack } from '@mantine/core';

const M3UPage = () => {
  const isLoading = useUserAgentsStore((state) => state.isLoading);
  const error = useUserAgentsStore((state) => state.error);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <Stack
      style={{
        padding: 10,
      }}
    >
      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <M3UsTable />
      </Box>

      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <EPGsTable />
      </Box>
    </Stack>
  );
};

export default M3UPage;
