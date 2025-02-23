import React, { useEffect, useState, useMemo } from 'react';
import useChannelsStore from '../store/channels';
import useStreamsStore from '../store/streams';
import Table from '../components/tables/Table';
import { ButtonGroup, Button, Checkbox, IconButton, Stack, Grid2, Grow } from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import ChannelForm from '../components/forms/Channel'
import API from '../api'
import StreamTableToolbar from '../components/StreamTableToolbar';

const ChannelsPage = () => {
  const [channel, setChannel] = useState(null)
  const [channelModelOpen, setChannelModalOpen] = useState(false);

  const channels = useChannelsStore((state) => state.channels);
  const streams = useStreamsStore((state) => state.streams);
  const isLoading = useChannelsStore((state) => state.isLoading);
  const error = useChannelsStore((state) => state.error);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const editChannel = async (channel = null) => {
    setChannel(channel)
    setChannelModalOpen(true)
  }

  const deleteChannel = async (ids) => {
    if (Array.isArray(ids)) {
      await API.deleteChannels(ids)
    } else {
      await API.deleteChannel(ids)
    }
  }

  return (
    <>
      <Grid2 container>
        <Grid2 size={6}>
          <Table
            name="Channels"
            data={channels}
            addAction={editChannel}
            bulkDeleteAction={deleteChannel}
            columnDef={[
              {
                id: 'select-col',
                header: ({ table }) => (
                  <Checkbox
                    size="small"
                    checked={table.getIsAllRowsSelected()}
                    indeterminate={table.getIsSomeRowsSelected()}
                    onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
                  />
                ),
                size: 10,
                cell: ({ row }) => (
                  <Checkbox
                    size="small"
                    checked={row.getIsSelected()}
                    disabled={!row.getCanSelect()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                ),
              },
              {
                header: '#',
                size: 10,
                accessorKey: 'channel_number',
              },
              {
                header: 'Name',
                accessorKey: 'channel_name',
              },
              {
                header: 'Group',
                // accessorFn: row => row.original.channel_group.name,
              },
              {
                header: 'Logo',
                accessorKey: 'logo_url',
                size: 50,
                cell: (info) => (
                  <Grid2
                    container
                    direction="row"
                    sx={{
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <img src={info.getValue() || "/images/logo.png"} width="20"/>
                  </Grid2>
                ),
                meta: {
                  filterVariant: null,
                },
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => {
                  console.log(row)
                  return (
                    <>
                      <IconButton
                        size="small" // Makes the button smaller
                        color="warning" // Red color for delete actions
                        onClick={() => {
                          editChannel(row.original)
                        }}
                      >
                        <EditIcon fontSize="small" /> {/* Small icon size */}
                      </IconButton>
                      <IconButton
                        size="small" // Makes the button smaller
                        color="error" // Red color for delete actions
                        onClick={() => deleteChannel(row.original.id)}
                      >
                        <DeleteIcon fontSize="small" /> {/* Small icon size */}
                      </IconButton>
                    </>
                  )
                }
              },
            ]}
          />
        </Grid2>
        <Grid2 size={6}>
          <Table
            name="Streams"
            customToolbar={StreamTableToolbar}
            data={streams}
            // addAction={editChannel}
            // bulkDeleteAction={deleteChannel}
            columnDef={[
              {
                id: 'select-col',
                header: ({ table }) => (
                  <Checkbox
                    size="small"
                    checked={table.getIsAllRowsSelected()}
                    indeterminate={table.getIsSomeRowsSelected()}
                    onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
                  />
                ),
                size: 10,
                cell: ({ row }) => (
                  <Checkbox
                    size="small"
                    checked={row.getIsSelected()}
                    disabled={!row.getCanSelect()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                ),
              },
              {
                header: 'Name',
                accessorKey: 'name',
              },
              {
                header: 'Group',
                accessorKey: 'group_name',
              },
              // {
              //   id: 'actions',
              //   header: 'Actions',
              //   cell: ({ row }) => {
              //     console.log(row)
              //     return (
              //       <IconButton
              //         size="small" // Makes the button smaller
              //         color="error" // Red color for delete actions
              //         onClick={() => deleteStream(row.original.id)}
              //       >
              //         <DeleteIcon fontSize="small" /> {/* Small icon size */}
              //       </IconButton>
              //     )
              //   }
              // },
            ]}
          />
        </Grid2>
      </Grid2>

      <ChannelForm
        channel={channel}
        isOpen={channelModelOpen}
        onClose={() => setChannelModalOpen(false)}
      />
    </>
  )
};

export default ChannelsPage;
