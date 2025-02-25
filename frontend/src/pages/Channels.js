import React from 'react';
import ChannelsTable from '../components/tables/ChannelsTable';
import StreamsTable from '../components/tables/StreamsTable';
import { Grid2, Box } from '@mui/material';

const ChannelsPage = () => {
  return (
    <Grid2 container>
      <Grid2 size={6}>
        <Box
          sx={{
            height: '100vh', // Full viewport height
            paddingTop: '20px', // Top padding
            paddingBottom: '20px', // Bottom padding
            paddingRight: '10px',
            paddingLeft: '20px',
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <ChannelsTable />
        </Box>
      </Grid2>
      <Grid2 size={6}>
        <Box
          sx={{
            height: '100vh', // Full viewport height
            paddingTop: '20px', // Top padding
            paddingBottom: '20px', // Bottom padding
            paddingRight: '20px',
            paddingLeft: '10px',
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <StreamsTable />
        </Box>
      </Grid2>
    </Grid2>
  )
};

export default ChannelsPage;
