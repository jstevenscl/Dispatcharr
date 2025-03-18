import React, { useState } from 'react';
import ChannelsTable from '../components/tables/ChannelsTable';
import StreamsTable from '../components/tables/StreamsTable';
import { Box, Grid } from '@mantine/core';

const ChannelsPage = () => {
  return (
    <Grid style={{ padding: 18 }}>
      <Grid.Col span={6}>
        <ChannelsTable />
      </Grid.Col>
      <Grid.Col span={6}>
        <StreamsTable />
      </Grid.Col>
    </Grid>
  );
};

export default ChannelsPage;
