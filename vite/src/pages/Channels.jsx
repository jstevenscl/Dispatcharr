import React, { useState } from 'react';
import ChannelsTable from '../components/tables/ChannelsTable';
import StreamsTable from '../components/tables/StreamsTable';
import { Box, Grid } from '@mantine/core';

const ChannelsPage = () => {
  return (
    <Grid>
      <Grid.Col span={6}>
        <Box
          sx={{
            height: '100vh', // Full viewport height
            paddingTop: 0, // Top padding
            paddingBottom: 1, // Bottom padding
            paddingRight: 0.5,
            paddingLeft: 0,
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <ChannelsTable />
        </Box>
      </Grid.Col>
      <Grid.Col span={6}>
        <Box
          sx={{
            height: '100vh', // Full viewport height
            paddingTop: 0, // Top padding
            paddingBottom: 1, // Bottom padding
            paddingRight: 0,
            paddingLeft: 0.5,
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <StreamsTable />
        </Box>
      </Grid.Col>
    </Grid>
  );
};

export default ChannelsPage;
