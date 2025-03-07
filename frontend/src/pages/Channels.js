import React, { useState } from 'react';
import ChannelsTable from '../components/tables/ChannelsTable';
import StreamsTable from '../components/tables/StreamsTable';
import { Grid2, Box } from '@mui/material';

const ChannelsPage = () => {
  const [selectedChannels, setSelectedChannels] = useState([]);

  return (
    <Grid2 container>
      <Grid2 size={6}>
        <Box
          sx={{
            height: '100vh', // Full viewport height
            paddingTop: 1, // Top padding
            paddingBottom: 1, // Bottom padding
            paddingRight: 0.5,
            paddingLeft: 1,
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <ChannelsTable setSelectedChannels={setSelectedChannels} />
        </Box>
      </Grid2>
      <Grid2 size={6}>
        <Box
          sx={{
            height: '100vh', // Full viewport height
            paddingTop: 1, // Top padding
            paddingBottom: 1, // Bottom padding
            paddingRight: 1,
            paddingLeft: 0.5,
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <StreamsTable selectedChannels={selectedChannels} />
        </Box>
      </Grid2>
    </Grid2>
  );
};

export default ChannelsPage;
