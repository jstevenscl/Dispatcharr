import React, { useState } from 'react';
import { Box, Snackbar } from '@mui/material';
import UserAgentsTable from '../components/tables/UserAgentsTable';
import EPGsTable from '../components/tables/EPGsTable';

const EPGPage = () => {
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
        <EPGsTable />
      </Box>

      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <UserAgentsTable />
      </Box>
    </Box>
  )
};

export default EPGPage;
